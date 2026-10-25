import katex from 'katex';

export function Formula({ value }: { value: string }) {
  // Only KaTeX-generated markup is inserted. Raw HTML is never accepted.
  const html = katex.renderToString(value, {
    throwOnError: false,
    trust: false,
    strict: 'error',
    maxExpand: 100,
    maxSize: 10,
  });
  return (
    <div
      className="formula"
      role="math"
      aria-label={value}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
