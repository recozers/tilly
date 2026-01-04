interface ToolCallIndicatorProps {
  toolName: string;
  iteration: number;
}

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ToolCallIndicator({ toolName, iteration }: ToolCallIndicatorProps): JSX.Element {
  return (
    <div className="tool-indicator">
      <div className="tool-indicator-spinner" />
      <div className="tool-indicator-content">
        <span className="tool-indicator-action">
          {formatToolName(toolName)}...
        </span>
        {iteration > 1 && (
          <span className="tool-indicator-iteration">
            (Step {iteration})
          </span>
        )}
      </div>
    </div>
  );
}
