"use client";

interface SkeletonProps {
    width?: string;
    height?: string;
    borderRadius?: string;
    className?: string;
}

export default function Skeleton({
    width = "100%",
    height = "20px",
    borderRadius = "6px",
    className = ""
}: SkeletonProps) {
    return (
        <div
            className={`animate-[shimmer_1.5s_linear_infinite] bg-[linear-gradient(90deg,#0D1017_25%,#111620_50%,#0D1017_75%)] bg-[length:200%_100%] ${className}`}
            style={{
                width,
                height,
                borderRadius
            }}
        />
    );
}
