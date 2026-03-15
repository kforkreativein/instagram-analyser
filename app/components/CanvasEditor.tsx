"use client";

import { Bold, Italic, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface CanvasEditorProps {
  initialText: string;
  onChange?: (text: string) => void;
  onAskAI?: (selection: string, instruction: string) => Promise<string | void> | string | void;
}

type ToolbarState = {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  range: Range | null;
};

export default function CanvasEditor({ initialText, onChange, onAskAI }: CanvasEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(initialText);
  const [toolbar, setToolbar] = useState<ToolbarState>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: "",
    range: null,
  });
  const [isAskOpen, setIsAskOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    onChange?.(text);
  }, [onChange, text]);

  function syncTextFromEditor() {
    if (!editorRef.current) return;
    setText(editorRef.current.innerText);
  }

  function updateSelectionToolbar() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setToolbar((prev) => ({ ...prev, visible: false, range: null }));
      setIsAskOpen(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const editorEl = editorRef.current;
    if (!editorEl) return;

    const commonNode = range.commonAncestorContainer;
    const parentElement = commonNode.nodeType === Node.TEXT_NODE ? commonNode.parentElement : (commonNode as HTMLElement);

    if (!parentElement || !editorEl.contains(parentElement)) {
      setToolbar((prev) => ({ ...prev, visible: false, range: null }));
      setIsAskOpen(false);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setToolbar((prev) => ({ ...prev, visible: false, range: null }));
      setIsAskOpen(false);
      return;
    }

    setToolbar({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      selectedText: selection.toString(),
      range: range.cloneRange(),
    });
  }

  function applyNativeFormat(command: "bold" | "italic") {
    document.execCommand(command);
    syncTextFromEditor();
  }

  async function handleAskAI() {
    if (!toolbar.range || !instruction.trim()) return;

    setIsApplying(true);
    try {
      let replacement: string | void = undefined;
      if (onAskAI) {
        replacement = await onAskAI(toolbar.selectedText, instruction.trim());
      }

      const finalReplacement =
        typeof replacement === "string" && replacement.trim().length > 0
          ? replacement
          : `${toolbar.selectedText} (${instruction.trim()})`;

      const workingRange = toolbar.range;
      workingRange.deleteContents();
      workingRange.insertNode(document.createTextNode(finalReplacement));
      syncTextFromEditor();

      setInstruction("");
      setIsAskOpen(false);
      setToolbar((prev) => ({ ...prev, visible: false, range: null }));
      window.getSelection()?.removeAllRanges();
    } finally {
      setIsApplying(false);
    }
  }

  const askPosition = useMemo(
    () => ({ left: toolbar.x, top: toolbar.y + 48 }),
    [toolbar.x, toolbar.y],
  );

  return (
    <div className="relative rounded-2xl border border-[#2c2c2e] bg-[#121214] p-4">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncTextFromEditor}
        onMouseUp={updateSelectionToolbar}
        onKeyUp={updateSelectionToolbar}
        className="min-h-[360px] whitespace-pre-wrap rounded-xl border border-[#2c2c2e] bg-[#0f0f10] p-4 text-sm leading-7 text-gray-100 outline-none focus:border-gray-600"
      >
        {text}
      </div>

      {toolbar.visible ? (
        <div
          style={{ left: toolbar.x, top: toolbar.y }}
          className="fixed z-40 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-gray-700 bg-[#1c1c1e] px-2 py-1.5 shadow-lg"
        >
          <button
            type="button"
            onClick={() => setIsAskOpen((prev) => !prev)}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-xs text-purple-300 transition hover:bg-[#2c2c2e]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask ChatGPT
          </button>
          <button
            type="button"
            onClick={() => applyNativeFormat("bold")}
            className="rounded-full p-1.5 text-gray-300 transition hover:bg-[#2c2c2e] hover:text-white"
            aria-label="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyNativeFormat("italic")}
            className="rounded-full p-1.5 text-gray-300 transition hover:bg-[#2c2c2e] hover:text-white"
            aria-label="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {toolbar.visible && isAskOpen ? (
        <div
          style={askPosition}
          className="fixed z-40 w-80 -translate-x-1/2 rounded-xl border border-gray-700 bg-[#1c1c1e] p-3 shadow-xl"
        >
          <p className="mb-2 text-xs font-medium text-gray-300">Refine selected text</p>
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder='e.g. "Make this funnier"'
            className="h-9 w-full rounded-lg border border-[#2c2c2e] bg-[#0f0f10] px-3 text-sm text-white outline-none ring-purple-500 transition focus:ring-2"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAskOpen(false)}
              className="rounded-lg border border-[#2c2c2e] px-3 py-1.5 text-xs text-gray-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAskAI}
              disabled={isApplying || !instruction.trim()}
              className="rounded-lg bg-purple-500 px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isApplying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
