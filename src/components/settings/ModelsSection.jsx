import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import ModelPicker from "@/components/chat/ModelPicker";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { SectionHeading, SectionLabel } from "@/components/settings/chrome";

const MIN_MAX_TOKENS = 128;
const MAX_MAX_TOKENS = 1_000_000;

export default function ModelsSection({
  selectedModel,
  onSelectedModelChange,
  titleGenerationModel,
  onTitleGenerationModelChange,
  maxTokens,
  onMaxTokensChange,
  openRouterProviders = {},
  onOpenRouterProvidersChange,
}) {
  const [providerModel, setProviderModel] = useState(selectedModel);
  const [providerSlug, setProviderSlug] = useState(
    openRouterProviders[selectedModel] || "",
  );
  const [editingModel, setEditingModel] = useState(null);

  const chooseProviderModel = (modelId) => {
    setProviderModel(modelId);
    setProviderSlug(openRouterProviders[modelId] || "");
    setEditingModel(null);
  };

  const saveProvider = () => {
    const slug = providerSlug.trim();
    if (
      !providerModel ||
      !slug ||
      slug.length > 64 ||
      !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)
    ) {
      return;
    }
    const next = { ...openRouterProviders };
    if (editingModel && editingModel !== providerModel) {
      delete next[editingModel];
    }
    next[providerModel] = slug;
    onOpenRouterProvidersChange?.(next);
    setEditingModel(null);
    setProviderSlug("");
  };

  const editProvider = (modelId) => {
    setProviderModel(modelId);
    setProviderSlug(openRouterProviders[modelId] || "");
    setEditingModel(modelId);
  };

  const changeDefaultModel = (modelId) => {
    onSelectedModelChange?.(modelId);
    if (!editingModel) chooseProviderModel(modelId);
  };

  const configuredProviders = Object.entries(openRouterProviders).filter(
    ([modelId, provider]) =>
      modelId && typeof provider === "string" && provider,
  );
  const boundedMaxTokens = Math.min(
    MAX_MAX_TOKENS,
    Math.round(Math.max(MIN_MAX_TOKENS, Number(maxTokens) || MIN_MAX_TOKENS)),
  );

  return (
    <div className="space-y-7">
      <SectionHeading
        title="Models"
        description="Choose your default models, provider routing, and output limit."
      />

      <div className="space-y-3">
        <SectionLabel
          id="default-model-label"
          description="Used for new chat turns."
        >
          Default Model
        </SectionLabel>
        <ModelPicker
          value={selectedModel}
          onChange={changeDefaultModel}
          triggerClassName="w-full justify-between border-border bg-muted rounded-xl px-4 h-12 font-medium text-sm"
          emptyLabel="Select Model"
          ariaLabelledBy="default-model-label"
        />
      </div>

      <div className="space-y-3">
        <SectionLabel
          id="title-model-label"
          description="Used to name new conversations."
        >
          Title Generation Model
        </SectionLabel>
        <ModelPicker
          value={titleGenerationModel}
          onChange={onTitleGenerationModelChange}
          triggerClassName="w-full justify-between border-border bg-muted rounded-xl px-4 h-12 font-medium text-sm"
          emptyLabel="Select Model"
          ariaLabelledBy="title-model-label"
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
        <div>
          <SectionHeading
            title="Provider override"
            description="Pin a model to one OpenRouter provider. Overrides are only saved when you add them."
          />
        </div>
        <SectionLabel id="provider-model-label">
          Model to configure
        </SectionLabel>
        <ModelPicker
          value={providerModel}
          onChange={chooseProviderModel}
          triggerClassName="w-full justify-between border-border bg-muted rounded-xl px-4 h-11 font-medium text-sm"
          emptyLabel="Choose Model"
          ariaLabelledBy="provider-model-label"
        />
        <div className="space-y-2">
          <SectionLabel
            htmlFor="openrouter-provider-slug"
            description="Restricts this model to the exact provider slug. Example: deepseek."
          >
            Provider Slug
          </SectionLabel>
          <Input
            id="openrouter-provider-slug"
            value={providerSlug}
            onChange={(event) => setProviderSlug(event.target.value)}
            placeholder="deepseek"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 border-border bg-background rounded-xl px-4 font-medium"
          />
        </div>
        <Button
          type="button"
          onPress={saveProvider}
          isDisabled={
            !providerModel ||
            !providerSlug.trim() ||
            providerSlug.trim().length > 64 ||
            !/^[a-z0-9][a-z0-9_-]*$/i.test(providerSlug.trim())
          }
          className="w-full rounded-xl sm:w-auto"
          aria-label={
            editingModel ? "Save provider override" : "Add provider override"
          }
        >
          {editingModel ? (
            <Check aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {editingModel ? "Save override" : "Add override"}
        </Button>

        {configuredProviders.length > 0 && (
          <ul
            className="space-y-2 pt-1"
            aria-label="Configured model providers"
          >
            {configuredProviders.map(([modelId, provider]) => (
              <li
                key={modelId}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0 flex-1 text-left text-xs">
                  <span className="block truncate font-semibold text-foreground">
                    {modelId}
                  </span>
                  <span className="text-muted-foreground">{provider}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit provider override for ${modelId}`}
                  onPress={() => editProvider(modelId)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete provider override for ${modelId}`}
                  onPress={() => {
                    const next = { ...openRouterProviders };
                    delete next[modelId];
                    onOpenRouterProvidersChange?.(next);
                    if (editingModel === modelId) {
                      setEditingModel(null);
                    }
                    if (providerModel === modelId) setProviderSlug("");
                  }}
                  className="h-11 w-11"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <SectionLabel
          htmlFor="max-output-tokens-number"
          description="Maximum number of tokens a response can generate (128–1,000,000)."
        >
          Max Output Tokens
        </SectionLabel>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={MIN_MAX_TOKENS}
            max={MAX_MAX_TOKENS}
            step="1"
            value={boundedMaxTokens}
            aria-label="Max Output Tokens slider"
            onChange={(event) => onMaxTokensChange(Number(event.target.value))}
            className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg bg-muted accent-foreground"
          />
          <Input
            id="max-output-tokens-number"
            type="number"
            min={MIN_MAX_TOKENS}
            max={MAX_MAX_TOKENS}
            step="1"
            value={boundedMaxTokens}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) {
                onMaxTokensChange(
                  Math.round(
                    Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, value)),
                  ),
                );
              }
            }}
            className="h-10 w-32 shrink-0 rounded-xl border-border bg-muted px-3 text-right text-sm font-bold tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}
