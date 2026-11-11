/** «PizzAI está escribiendo…»: tres puntos animados con texto para lectores de pantalla. */
export function TypingIndicator() {
  return (
    <div
      role="status"
      className="bg-card border-border flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm border px-4 py-3"
    >
      <span className="sr-only">PizzAI está escribiendo</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden
          style={{ animationDelay: `${index * 0.18}s` }}
          className="pizzai-dot bg-charcoal/60 block size-2 rounded-full"
        />
      ))}
    </div>
  );
}
