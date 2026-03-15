"use client";

import { CornerDownLeft } from "lucide-react";

interface SearchFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function SearchForm({ value, onChange, onSubmit, loading = false, disabled = false }: SearchFormProps) {
  function handleSubmit() {
    if (!disabled && !loading) {
      onSubmit();
    }
  }

  return (
    <div className="mt-8 flex w-full max-w-5xl items-center gap-3">
      <div className="relative flex h-14 flex-1 items-center rounded-xl border border-[#2c2c2e] bg-[#1c1c1e] px-4 transition-all focus-within:border-gray-500">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Search for videos by topic"
          className="w-full bg-transparent text-lg text-white placeholder-gray-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || loading}
          className="ml-3 flex items-center gap-2 rounded-lg bg-[#2c2c2e] px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-[#3c3c3e] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Go
          <CornerDownLeft size={16} />
        </button>
      </div>
    </div>
  );
}
