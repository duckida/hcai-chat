import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { Label } from "@/components/primitives/label";

function SectionLabel({ htmlFor, children, description }) {
  return (
    <div className="space-y-1">
      <Label
        htmlFor={htmlFor}
        className="text-[13px] font-bold text-muted-foreground uppercase tracking-widest pl-1"
      >
        {children}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground pl-1 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xl font-[900] tracking-tight text-foreground">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function SwitchRow({ id, label, description, checked, onChange }) {
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-xl border border-border">
      <div>
        <Label
          htmlFor={id}
          className="text-[13px] font-bold text-foreground uppercase tracking-widest"
        >
          {label}
        </Label>
        <p
          id={descriptionId}
          className="text-xs text-muted-foreground mt-0.5 pl-1"
        >
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function KeyInput({
  id,
  type,
  value,
  onChange,
  placeholder,
  showValue,
  onToggleShow,
  error = false,
}) {
  return (
    <div className="relative group">
      <Input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`h-12 border-border bg-muted rounded-xl px-5 transition-all focus:bg-background focus:ring-4 focus:ring-ring placeholder:text-muted-foreground font-medium ${error ? "border-red-400 focus:ring-destructive/10" : ""}`}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleShow}
        className="absolute right-2 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors"
      >
        {showValue ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export { KeyInput, SectionHeading, SectionLabel, SwitchRow };
