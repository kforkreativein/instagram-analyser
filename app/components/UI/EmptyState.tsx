"use client";

import React from "react";

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description: string;
    action?: React.ReactNode;
    className?: string;
}

export default function EmptyState({
    icon,
    title,
    description,
    action,
    className = ""
}: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center min-h-[180px] p-[32px] gap-[10px] text-center ${className}`}>
            {icon && (
                <div className="text-[36px] text-[rgba(255,255,255,0.08)] mb-[4px]">
                    {icon}
                </div>
            )}
            <h3 className="font-['Syne'] font-[700] text-[15px] text-[#5A6478]">
                {title}
            </h3>
            <p className="font-['DM_Sans'] text-[12.5px] text-[#5A6478] opacity-70 max-w-[260px] leading-[1.5]">
                {description}
            </p>
            {action && (
                <div className="mt-[8px]">
                    {action}
                </div>
            )}
        </div>
    );
}
