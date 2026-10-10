"use client";

import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Globe,
  PanelRightOpen,
  Puzzle,
} from "lucide-react";
import ContextUsage from "@/components/chat/ContextUsage";
import ModelPicker from "@/components/chat/ModelPicker";
import ThinkingPicker from "@/components/chat/ThinkingPicker";
import { Button } from "@/components/primitives/button";
import { Tooltip, TooltipTrigger } from "@/components/primitives/tooltip";

function ToggleButton({
  active,
  disabled,
  onClick,
  tooltip,
  children,
  activeClass,
}) {
  return (
    <TooltipTrigger>
      <Button
        variant="ghost"
        size="icon"
        isDisabled={disabled}
        onClick={onClick}
        aria-label={tooltip}
        className={`h-7 w-7 sm:h-8 sm:w-8 transition-colors ${
          disabled
            ? "opacity-40 cursor-not-allowed text-muted-foreground"
            : active
              ? activeClass
              : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {children}
      </Button>
      <Tooltip>
        <p className="text-xs">{tooltip}</p>
      </Tooltip>
    </TooltipTrigger>
  );
}

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  mobileNav,
  selectedModel,
  onModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  artifactsEnabled,
  onArtifactsChange,
  webSearchEnabled,
  onWebSearchChange,
  agentModeEnabled,
  onAgentModeChange,
  artifactFullscreen = false,
  panelOpen = false,
  panelAvailable = false,
  onTogglePanel,
  contextUsage = 0,
  toolsSupported = true,
  hasE2bKey = false,
  totalCost = 0,
}) {
  return (
    <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between gap-2 px-3 sm:px-4 bg-background/80 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            // Icon-only, so the name has to be explicit. Without it this is a
            // chevron to a screen reader, and React says so on every load.
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="hidden md:flex h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        )}
        {mobileNav}
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center gap-0 sm:gap-2 overflow-hidden">
        {!artifactFullscreen && (
          <>
            <div className="flex items-center gap-0.5 sm:gap-1">
              <ThinkingPicker
                modelId={selectedModel}
                value={thinkingLevel}
                onChange={onThinkingLevelChange}
              />

              <ToggleButton
                active={artifactsEnabled}
                onClick={() => onArtifactsChange(!artifactsEnabled)}
                tooltip={`Toggle artifacts ${artifactsEnabled ? "off" : "on"}`}
                activeClass="text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950"
              >
                <Puzzle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </ToggleButton>

              <ToggleButton
                active={webSearchEnabled}
                disabled={!toolsSupported}
                onClick={() => onWebSearchChange(!webSearchEnabled)}
                tooltip={
                  toolsSupported
                    ? `Toggle web search ${webSearchEnabled ? "off" : "on"}`
                    : "Not supported by current model"
                }
                activeClass="text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950"
              >
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </ToggleButton>

              <ToggleButton
                active={agentModeEnabled}
                disabled={!toolsSupported || !hasE2bKey}
                onClick={() => onAgentModeChange(!agentModeEnabled)}
                tooltip={
                  !hasE2bKey
                    ? "Add your E2B API key in Settings to use cloud sandbox"
                    : toolsSupported
                      ? `Toggle cloud sandbox ${agentModeEnabled ? "off" : "on"}`
                      : "Not supported by current model"
                }
                activeClass="text-sky-500 bg-sky-50 dark:text-sky-400 dark:bg-sky-950"
              >
                <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </ToggleButton>
            </div>

            <ModelPicker value={selectedModel} onChange={onModelChange} />
          </>
        )}
      </div>

      {!artifactFullscreen && (
        <div className="flex items-center shrink-0 gap-1">
          {/*
            The only way back into a dismissed panel. Its own collapsed state
            cannot host this button: the closed panel's grid track is zero
            pixels wide at the viewport's right edge, so a toggle rendered
            there is laid out off-screen and clipped — present in the DOM,
            unreachable by pointer. Same pattern, same side of the header as
            the sidebar's Expand button, for the same reason.
          */}
          {panelAvailable && !panelOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePanel}
              aria-label="Open side panel"
              className="hidden md:flex h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground transition-colors"
            >
              <PanelRightOpen className="w-4 h-4" />
            </Button>
          )}
          <ContextUsage
            used={contextUsage}
            modelId={selectedModel}
            totalCost={totalCost}
          />
        </div>
      )}
    </header>
  );
}
