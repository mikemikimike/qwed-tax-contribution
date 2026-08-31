export enum WorkerType {
    EMPLOYEE = "W2",
    CONTRACTOR = "1099"
}

export class ClassificationGuard {
    /**
     * Deterministic IRS Common Law Test.
     */
    static verifyWorkerStatus(behavioralControl: boolean, financialControl: boolean, relationshipPermanence: boolean): WorkerType {
        if (behavioralControl && financialControl) {
            return WorkerType.EMPLOYEE;
        }
        if (relationshipPermanence && behavioralControl) {
            return WorkerType.EMPLOYEE;
        }
        return WorkerType.CONTRACTOR;
    }
}

export class NexusGuard {
    private static thresholds: Record<string, { amount: number; transactions: number }> = {
        "NY": { amount: 500000, transactions: 100 },
        "CA": { amount: 500000, transactions: 0 },
        "TX": { amount: 500000, transactions: 0 },
        "FL": { amount: 100000, transactions: 0 }
    };

    static checkNexus(state: string, ytdSales: number, transactions: number = 0, claimedCollectsTax?: unknown): { verified: boolean; error?: string } {
        const stateCode = state.toUpperCase();
        const t = this.thresholds[stateCode];
        if (!t) {
            return {
                verified: false,
                error: `State ${stateCode} not in configured nexus threshold table. Cannot verify nexus liability — block pending rule configuration.`
            };
        }

        const hit = ytdSales >= t.amount || (t.transactions > 0 && transactions >= t.transactions);
        if (typeof claimedCollectsTax !== 'boolean') {
            return {
                verified: false,
                error: "Computed nexus liability only. Provide claimed_collects_tax as a boolean for deterministic verification."
            };
        }

        if (claimedCollectsTax !== hit) {
            return {
                verified: false,
                error: hit
                    ? `Nexus threshold exceeded in ${state}. Registration required.`
                    : `Nexus claim mismatch: ${state} is below its configured threshold, but tax collection was claimed.`
            };
        }
        return { verified: true };
    }
}

export class TaxPreFlight {
    static audit(intent: any): { allowed: boolean, blocks: string[] } {
        const blocks: string[] = [];

        // 1. Classification
        if (intent.worker_facts) {
            const status = ClassificationGuard.verifyWorkerStatus(
                intent.worker_facts.provides_tools,
                intent.worker_facts.reimburses_expenses,
                intent.worker_facts.indefinite_relationship
            );
            if (intent.worker_type && intent.worker_type !== status) {
                blocks.push(`Misclassification Risk: Logic says ${status}, Intent says ${intent.worker_type}`);
            }
        }

        // 2. Nexus
        if (intent.sales_data && intent.state) {
            const hasStructuredClaim = Object.prototype.hasOwnProperty.call(intent, 'claimed_collects_tax');
            const claimedCollectsTax = hasStructuredClaim
                ? intent.claimed_collects_tax
                : intent.tax_decision === 'no_tax' ? false : undefined;
            const check = NexusGuard.checkNexus(
                intent.state,
                intent.sales_data.amount,
                intent.sales_data.transactions,
                claimedCollectsTax
            );
            if (!check.verified) {
                blocks.push(check.error!);
            }
        }

        return { allowed: blocks.length === 0, blocks };
    }
}
