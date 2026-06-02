const fs = require("node:fs");

const path = "./src/components/chat/ArtifactPanel.jsx";
let content = fs.readFileSync(path, "utf8");

const regex =
  /\/\/ Only show toggle if there's something to display[\s\S]*?className="flex flex-row h-full bg-white max-md:flex-col max-md:fixed max-md:inset-0 max-md:z-50"/m;

const replacement = `  if (allArtifacts.length === 0) return null;

  return (
    <AnimatePresence mode="wait">
      {!isOpen ? (
        <motion.div
          key="toggle"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          {/* Desktop toggle button */}
          <div className="hidden md:flex items-start pt-3 pr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
              title="Open artifact panel"
            >
              <PanelRightOpen className="w-4 h-4" />
            </Button>
          </div>
          {/* Mobile floating pill */}
          <div className="md:hidden fixed bottom-28 left-1/2 -translate-x-1/2 z-40">
            <button
              onClick={streamingArtifact ? undefined : onToggle}
              className={\`rounded-full py-3 px-5 shadow-lg flex items-center gap-2.5 font-semibold text-[14px] transition-all active:scale-95 \${
                streamingArtifact
                  ? "bg-slate-200 text-slate-500 cursor-default"
                  : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-purple-600/30 cursor-pointer"
              }\`}
            >
              <Puzzle
                className={\`w-4 h-4 \${streamingArtifact ? "animate-pulse" : ""}\`}
              />
              <span>
                {streamingArtifact
                  ? "Generating..."
                  : \`Open Artifact\${allArtifacts.length > 1 ? \` (\${allArtifacts.length})\` : ""}\`}
              </span>
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="panel"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex flex-row h-full bg-white max-md:flex-col max-md:fixed max-md:inset-0 max-md:z-50"`;

content = content.replace(regex, replacement);

const finalRegex = /<\/div>\s*<\/div>\s*<\/div>\s*\);\s*}\s*$/m;
const finalReplacement = `        </div>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}`;

content = content.replace(finalRegex, finalReplacement);

fs.writeFileSync(path, content);
