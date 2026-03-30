interface QuickRepliesProps {
  replies: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export default function QuickReplies({ replies, onSelect, disabled }: QuickRepliesProps) {
  if (replies.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 ml-12">
      {replies.map((text) => (
        <button
          key={text}
          disabled={disabled}
          onClick={() => onSelect(text)}
          className="px-4 py-2 rounded-full text-xs font-bold border border-primary/20 text-primary bg-[var(--surface-container-lowest)] hover:bg-primary/5 transition-all active:scale-95 disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
