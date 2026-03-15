export function formatRelativeTime(isoDate: string): string {
    try {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffDay > 30) {
            return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        }
        if (diffDay > 0) return `${diffDay}d ago`;
        if (diffHour > 0) return `${diffHour}h ago`;
        if (diffMin > 0) return `${diffMin}m ago`;
        return "just now";
    } catch (err) {
        return "just now";
    }
}

export function formatNumber(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "0";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function calculateOutlierScore(
    views: number | null | undefined,
    averageViews: number | null | undefined,
    precision = 1,
): number | null {
    if (typeof views !== "number" || !Number.isFinite(views) || views <= 0) {
        return null;
    }

    if (typeof averageViews !== "number" || !Number.isFinite(averageViews) || averageViews <= 0) {
        return null;
    }

    return Number((views / averageViews).toFixed(precision));
}

export function getFirstValidOutlierScore(...scores: Array<number | null | undefined>): number | null {
    for (const score of scores) {
        if (typeof score === "number" && Number.isFinite(score) && score > 0) {
            return score;
        }
    }

    return null;
}
