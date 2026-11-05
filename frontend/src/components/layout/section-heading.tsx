import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  as?: "h1" | "h2";
  tone?: "dark" | "light";
  className?: string;
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  as: Heading = "h2",
  tone = "dark",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl space-y-2", className)}>
      {eyebrow ? (
        <p
          className={cn(
            "text-sm font-bold tracking-widest uppercase",
            tone === "dark" ? "text-tomato-deep" : "text-gold",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <Heading id={id} className="text-4xl leading-none font-extrabold sm:text-5xl">
        {title}
      </Heading>
      {description ? (
        <p
          className={cn(
            "text-base sm:text-lg",
            tone === "dark" ? "text-muted-foreground" : "text-cream/85",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
