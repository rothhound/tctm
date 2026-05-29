import { useRef, useEffect, useCallback } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  minRows?: number;
}

function ToolbarButton({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
        active
          ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, onBlur, placeholder, autoFocus, minRows = 3 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  // Set initial content once
  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      editorRef.current.innerHTML = value;
      isInitialized.current = true;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
      // Move cursor to end
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [autoFocus]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleInput();
  }, [handleInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Bold: Cmd/Ctrl+B
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      exec('bold');
    }
    // Italic: Cmd/Ctrl+I
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      exec('italic');
    }
    // Underline: Cmd/Ctrl+U
    if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
      e.preventDefault();
      exec('underline');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Allow pasting HTML from clipboard (copy-paste from emails, docs)
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      // Clean the HTML — keep only basic formatting
      const cleaned = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/class="[^"]*"/gi, '')
        .replace(/style="[^"]*"/gi, '')
        .replace(/id="[^"]*"/gi, '');
      document.execCommand('insertHTML', false, cleaned);
      handleInput();
    }
  };

  const minHeight = minRows * 24;

  return (
    <div className="border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] focus-within:border-[var(--color-primary)] transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--color-border)]">
        <ToolbarButton onClick={() => exec('bold')} title="Bold (Cmd+B)">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} title="Italic (Cmd+I)">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('underline')} title="Underline (Cmd+U)">
          <span className="underline">U</span>
        </ToolbarButton>
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="2" cy="3" r="1" />
            <circle cx="2" cy="6" r="1" />
            <circle cx="2" cy="9" r="1" />
            <rect x="5" y="2.5" width="6" height="1" rx="0.5" />
            <rect x="5" y="5.5" width="6" height="1" rx="0.5" />
            <rect x="5" y="8.5" width="6" height="1" rx="0.5" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('insertOrderedList')} title="Numbered list">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <text x="0" y="4" fontSize="4" fontFamily="system-ui">1</text>
            <text x="0" y="7" fontSize="4" fontFamily="system-ui">2</text>
            <text x="0" y="10" fontSize="4" fontFamily="system-ui">3</text>
            <rect x="5" y="2.5" width="6" height="1" rx="0.5" />
            <rect x="5" y="5.5" width="6" height="1" rx="0.5" />
            <rect x="5" y="8.5" width="6" height="1" rx="0.5" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className="px-3 py-2 text-base md:text-sm text-[var(--color-text)] leading-relaxed outline-none overflow-y-auto [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-0.5 empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-text-muted)] empty:before:pointer-events-none"
        style={{ minHeight: `${minHeight}px` }}
      />
    </div>
  );
}
