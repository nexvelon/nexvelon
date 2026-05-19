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
  showVendor: boolean;
  onShowVendorChange: (value: boolean) => void;
  showSku: boolean;
  onShowSkuChange: (value: boolean) => void;
  showName: boolean;
  onShowNameChange: (value: boolean) => void;
  showDescription: boolean;
  onShowDescriptionChange: (value: boolean) => void;
  onTemplateChange: (slug: QuoteTemplateSlug) => void;
  onThemeChange: (slug: QuoteThemeSlug) => void;
  onShowUnitPriceChange: (value: boolean) => void;
  disabled?: boolean;
}

export function DocumentStyleCard({
  templateSlug,
  themeSlug,
  showUnitPrice,
  showVendor,
  onShowVendorChange,
  showSku,
  onShowSkuChange,
  showName,
  onShowNameChange,
  showDescription,
  onShowDescriptionChange,
  onTemplateChange,
  onThemeChange,
  onShowUnitPriceChange,
  disabled,
}: Props) {
  const selectedTemplate = templateSlug ? QUOTE_TEMPLATES[templateSlug] : null;

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
              <SelectValue>
                {selectedTemplate ? (
                  selectedTemplate.displayName
                ) : (
                  <span className="text-muted-foreground">
                    Select template…
                  </span>
                )}
              </SelectValue>
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

        {/* PDF visibility group */}
        <div className="space-y-3">
          <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            PDF visibility
          </Label>

          {/* Show vendor toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="quote-show-vendor" className="text-xs">
                  Show vendor name
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Adds vendor name to the part info line.
                </p>
              </div>
              <Button
                id="quote-show-vendor"
                type="button"
                size="sm"
                variant={showVendor ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onShowVendorChange(!showVendor)}
                aria-pressed={showVendor}
                className="min-w-[3.5rem]"
              >
                {showVendor ? "On" : "Off"}
              </Button>
            </div>
          </div>

          {/* Show SKU / part # toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="quote-show-sku" className="text-xs">
                  Show part number
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Adds the SKU / part number to the part info line.
                </p>
              </div>
              <Button
                id="quote-show-sku"
                type="button"
                size="sm"
                variant={showSku ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onShowSkuChange(!showSku)}
                aria-pressed={showSku}
                className="min-w-[3.5rem]"
              >
                {showSku ? "On" : "Off"}
              </Button>
            </div>
          </div>

          {/* Show part name toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="quote-show-name" className="text-xs">
                  Show part name
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Shows the part name as the primary description line.
                </p>
              </div>
              <Button
                id="quote-show-name"
                type="button"
                size="sm"
                variant={showName ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onShowNameChange(!showName)}
                aria-pressed={showName}
                className="min-w-[3.5rem]"
              >
                {showName ? "On" : "Off"}
              </Button>
            </div>
          </div>

          {/* Show part description toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="quote-show-description" className="text-xs">
                  Show part description
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Shows the description (as primary if name is hidden,
                  otherwise secondary).
                </p>
              </div>
              <Button
                id="quote-show-description"
                type="button"
                size="sm"
                variant={showDescription ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onShowDescriptionChange(!showDescription)}
                aria-pressed={showDescription}
                className="min-w-[3.5rem]"
              >
                {showDescription ? "On" : "Off"}
              </Button>
            </div>
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
