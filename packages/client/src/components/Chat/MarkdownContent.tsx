import ReactMarkdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Renders markdown content with streaming support.
 * Supports basic formatting: bold, italic, and lists.
 */
export function MarkdownContent({ content, isStreaming }: MarkdownContentProps): JSX.Element {
  return (
    <span className="markdown-content">
      <ReactMarkdown
        allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'br']}
        unwrapDisallowed={true}
        components={{
          p: ({ children }) => <>{children}</>,
          strong: ({ children }) => <strong className="md-bold">{children}</strong>,
          em: ({ children }) => <em className="md-italic">{children}</em>,
          ul: ({ children }) => <ul className="md-list">{children}</ul>,
          ol: ({ children }) => <ol className="md-list">{children}</ol>,
          li: ({ children }) => <li className="md-list-item">{children}</li>,
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="typing-cursor">|</span>}
    </span>
  );
}
