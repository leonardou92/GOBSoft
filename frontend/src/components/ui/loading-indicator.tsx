interface LoadingIndicatorProps {
  text?: string;
  className?: string;
  sizeClassName?: string;
}

export function LoadingIndicator({
  text = "Cargando...",
  className = "py-6",
  sizeClassName = "h-14 w-14",
}: LoadingIndicatorProps) {
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-2 text-center`}>
      <img
        src="/images/loader.gif"
        alt="Cargando"
        className={`${sizeClassName} object-contain`}
      />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
