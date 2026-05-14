"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QUOTE_THEMES,
  QUOTE_THEME_SLUGS,
  type QuoteThemeSlug,
} from "@/lib/quote-themes";
import {
  QUOTE_TEMPLATES,
  QUOTE_TEMPLATE_SLUGS,
  type QuoteTemplateSlug,
} from "@/lib/company-profile";

interface Props {
  templateSlug: QuoteTemplateSlug;
  themeSlug: QuoteThemeSlug;
  showUnitPrice: boolean;
  onTemplateChange: (slug: QuoteTemplateSlug) => void;
  onThemeChange: (slug: QuoteThemeSlug) => void;
  onShowUnitPriceChange: (value: boolean) => void;
  disabled?: boolean;
}

export function DocumentStyleCard({
  templateSlug,
  themeSlug,
  showUnitPrice,
  onTemplateChange,
  onThemeChange,
  onShowUnitPriceChange,
  disabled,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-brand-navy font-serif text-lg">
          Document Style
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Template picker */}
        <div className="space-y-1.5">
          <Label htmlFor="quote-template" className="text-xs">
            Template
          </Label>
          <Select
            value={templateSlug}
            onValueChange={(v) => onTemplateChange(v as QuoteTemplateSlug)}
            disabled={disabled}
          >
            <SelectTrigger id="quote-template" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUOTE_TEMPLATE_SLUGS.map((slug) => {
                const tpl = QUOTE_TEMPLATES[slug];
                return (
                  <SelectItem
                    key={slug}
                    value={slug}
                    disabled={!tpl.enabled}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{tpl.displayName}</span>
                      {!tpl.enabled && (
                        <span className="text-muted-foreground text-[10px]">
                          (coming soon — letterhead not yet designed)
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Theme picker */}
        <div className="space-y-1.5">
          <Label htmlFor="quote-theme" className="text-xs">
            Theme
          </Label>
          <Select
            value={themeSlug}
            onValueChange={(v) => onThemeChange(v as QuoteThemeSlug)}
            disabled={disabled}
          >
            <SelectTrigger id="quote-theme" className="h-9 text-sm">
              <SelectValue>
                <ThemeRow slug={themeSlug} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {QUOTE_THEME_SLUGS.map((slug) => (
                <SelectItem key={slug} value={slug}>
                  <ThemeRow slug={slug} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Show unit price toggle */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="quote-show-unit-price" className="text-xs">
                Show unit price column
              </Label>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Adds a Unit Price column to the Particulars table.
              </p>
            </div>
            <Button
              id="quote-show-unit-price"
              type="button"
              size="sm"
              variant={showUnitPrice ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onShowUnitPriceChange(!showUnitPrice)}
              aria-pressed={showUnitPrice}
              className="min-w-[3.5rem]"
            >
              {showUnitPrice ? "On" : "Off"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeRow({ slug }: { slug: QuoteThemeSlug }) {
  const theme = QUOTE_THEMES[slug];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-0.5">
        <span
          className="h-3 w-3 rounded-sm border border-[var(--border)]"
          style={{ background: theme.ambience }}
          aria-hidden
        />
        <span
          className="h-3 w-3 rounded-sm border border-[var(--border)]"
          style={{ background: theme.accent }}
          aria-hidden
        />
        <span
          className="h-3 w-3 rounded-sm border border-[var(--border)]"
          style={{ background: theme.ink }}
          aria-hidden
        />
      </span>
      <span className="text-sm">{theme.displayName}</span>
      <span className="text-muted-foreground text-[11px]">
        — {theme.mood}
      </span>
    </span>
  );
}
