"use client";

import React from "react";
import { 
  Bot, 
  Brain, 
  Lightbulb, 
  Target, 
  Zap, 
  Play,
  Sparkles,
  MessageSquare
} from "lucide-react";

interface FormattedAiMessageProps {
  content: string;
  onExecuteCommand?: (command: string) => void;
}

interface Section {
  key: string;
  title: string;
  content: string;
  icon: string;
  colorClass: string;
  glowClass: string;
  headerIcon: React.ComponentType<any>;
}

const sectionHeaders = [
  { 
    key: "directAnswer", 
    pattern: /🟢?\s*1\.\s*DIRECT\s*ANSWER/i, 
    title: "Direct Answer", 
    icon: "Bot", 
    colorClass: "border-emerald-500/25 bg-emerald-500/5 text-emerald-400",
    glowClass: "shadow-[0_0_15px_rgba(16,185,129,0.08)]",
    headerIcon: Bot
  },
  { 
    key: "observations", 
    pattern: /🧠?\s*2\.\s*(ANALYTICAL\s*INSIGHT|AI\s*OBSERVATIONS)/i, 
    title: "Analytical Insight", 
    icon: "Brain", 
    colorClass: "border-cyan-500/25 bg-cyan-500/5 text-cyan-400",
    glowClass: "shadow-[0_0_15px_rgba(6,182,212,0.08)]",
    headerIcon: Brain
  },
  { 
    key: "insights", 
    pattern: /💡?\s*3\.\s*(DYNAMIC\s*INTERPRETATION\s*METHOD|INSIGHTS)/i, 
    title: "Dynamic Interpretation Method", 
    icon: "Lightbulb", 
    colorClass: "border-amber-500/25 bg-amber-500/5 text-amber-400",
    glowClass: "shadow-[0_0_15px_rgba(245,158,11,0.08)]",
    headerIcon: Lightbulb
  },
  { 
    key: "recommendations", 
    pattern: /🎯?\s*4\.\s*(SUGGESTED\s*ACTION|RECOMMENDED\s*ACTIONS)/i, 
    title: "Suggested Action", 
    icon: "Target", 
    colorClass: "border-violet-500/25 bg-violet-500/5 text-violet-400",
    glowClass: "shadow-[0_0_15px_rgba(139,92,246,0.08)]",
    headerIcon: Target
  },
  { 
    key: "executionOptions", 
    pattern: /⚡?\s*5\.\s*AI\s*EXECUTION\s*OPTIONS/i, 
    title: "AI Execution Options", 
    icon: "Zap", 
    colorClass: "border-rose-500/25 bg-rose-500/5 text-rose-400",
    glowClass: "shadow-[0_0_15px_rgba(244,63,94,0.08)]",
    headerIcon: Zap
  },
];

const formatTextInline = (text: string) => {
  if (!text) return "";
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-extrabold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

export default function FormattedAiMessage({ content, onExecuteCommand }: FormattedAiMessageProps) {
  if (!content) return null;

  // Find all header index locations
  const matches: { 
    key: string; 
    index: number; 
    title: string; 
    icon: string; 
    colorClass: string; 
    glowClass: string;
    headerIcon: React.ComponentType<any>;
  }[] = [];

  sectionHeaders.forEach((sh) => {
    const regex = new RegExp(sh.pattern);
    const match = content.match(regex);
    if (match && match.index !== undefined) {
      let title = sh.title;
      const matchedText = match[0];
      if (/ANALYTICAL\s*INSIGHT/i.test(matchedText)) {
        title = "Analytical Insight";
      } else if (/AI\s*OBSERVATIONS/i.test(matchedText)) {
        title = "AI Observations";
      } else if (/DYNAMIC\s*INTERPRETATION\s*METHOD/i.test(matchedText)) {
        title = "Dynamic Interpretation Method";
      } else if (/INSIGHTS/i.test(matchedText)) {
        title = "AI Insights";
      } else if (/SUGGESTED\s*ACTION/i.test(matchedText)) {
        title = "Suggested Action";
      } else if (/RECOMMENDED\s*ACTIONS/i.test(matchedText)) {
        title = "Recommended Actions";
      }

      matches.push({
        key: sh.key,
        index: match.index,
        title: title,
        icon: sh.icon,
        colorClass: sh.colorClass,
        glowClass: sh.glowClass,
        headerIcon: sh.headerIcon
      });
    }
  });

  // If no structured headers matched, render as unstructured plain text
  if (matches.length === 0) {
    return (
      <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
        {content.split("\n").map((line, idx) => (
          <p key={idx} className={line.trim() === "" ? "h-2" : "mb-1"}>
            {formatTextInline(line)}
          </p>
        ))}
      </div>
    );
  }

  // Sort matched sections by their index in response
  matches.sort((a, b) => a.index - b.index);

  const sections: Section[] = [];
  
  // Extract text segments between matching headers
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    
    const startIdx = current.index;
    const endIdx = next ? next.index : content.length;
    
    const rawChunk = content.slice(startIdx, endIdx);
    const lines = rawChunk.split("\n");
    if (lines.length > 0) {
      lines.shift(); // Remove the header line itself
    }
    
    sections.push({
      key: current.key,
      title: current.title,
      content: lines.join("\n").trim(),
      icon: current.icon,
      colorClass: current.colorClass,
      glowClass: current.glowClass,
      headerIcon: current.headerIcon
    });
  }

  // Prepend prefix content if any exists before the first matched header
  if (matches[0].index > 0) {
    const prefixContent = content.slice(0, matches[0].index).trim();
    if (prefixContent) {
      sections.unshift({
        key: "unstructured",
        title: "",
        content: prefixContent,
        icon: "Bot",
        colorClass: "border-border/30 bg-secondary/5 text-gray-300",
        glowClass: "",
        headerIcon: Bot
      });
    }
  }

  const renderSectionContent = (sect: Section) => {
    const { key, content: body } = sect;

    if (key === "executionOptions") {
      const lines = body.split("\n");
      return (
        <div className="space-y-2 mt-2">
          {lines.map((line, idx) => {
            const checkboxMatch = line.match(/^-\s*\[\s*\]\s*(.*)$/);
            if (checkboxMatch) {
              const actionText = checkboxMatch[1].trim();
              let commandToRun = actionText;

              // Clean up run command prefixes
              const runActionMatch = actionText.match(/^(?:Run action|Create task|Execute|Command):\s*['"`]?(.*?)['"`]?$/i);
              if (runActionMatch) {
                commandToRun = runActionMatch[1];
              } else {
                commandToRun = actionText.replace(/^['"`]|['"`]$/g, "");
              }

              return (
                <div 
                  key={idx} 
                  className="flex items-center gap-3 p-3 rounded-xl border border-rose-500/10 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/25 transition-all duration-200"
                >
                  <div className="w-5 h-5 rounded border border-rose-500/30 flex items-center justify-center text-rose-400 bg-rose-500/5">
                    <Play className="w-2.5 h-2.5 fill-current opacity-70" />
                  </div>
                  <div className="flex-1 text-xs font-semibold text-gray-300">
                    {formatTextInline(actionText)}
                  </div>
                  <button
                    onClick={() => onExecuteCommand && onExecuteCommand(commandToRun)}
                    className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500 text-[10px] font-black uppercase tracking-wider text-rose-300 hover:text-white transition-all cursor-pointer"
                  >
                    Execute
                  </button>
                </div>
              );
            }
            return (
              <p key={idx} className="text-xs text-gray-400">
                {formatTextInline(line)}
              </p>
            );
          })}
        </div>
      );
    }

    const lines = body.split("\n");
    return (
      <div className="space-y-2.5">
        {lines.map((line, idx) => {
          // Check for checkbox action item first
          const checkboxMatch = line.trim().match(/^-\s*\[\s*\]\s*(.*)$/);
          if (checkboxMatch) {
            const actionText = checkboxMatch[1].trim();
            let commandToRun = actionText;

            // Clean up run command prefixes
            const runActionMatch = actionText.match(/^(?:Run action|Create task|Execute|Command):\s*['"`]?(.*?)['"`]?$/i);
            if (runActionMatch) {
              commandToRun = runActionMatch[1];
            } else {
              commandToRun = actionText.replace(/^['"`]|['"`]$/g, "");
            }

            return (
              <div 
                key={idx} 
                className="flex items-center gap-3 p-3 rounded-xl border border-rose-500/10 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/25 transition-all duration-200 mt-2"
              >
                <div className="w-5 h-5 rounded border border-rose-500/30 flex items-center justify-center text-rose-400 bg-rose-500/5">
                  <Play className="w-2.5 h-2.5 fill-current opacity-70" />
                </div>
                <div className="flex-1 text-xs font-semibold text-gray-300">
                  {formatTextInline(actionText)}
                </div>
                <button
                  onClick={() => onExecuteCommand && onExecuteCommand(commandToRun)}
                  className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500 text-[10px] font-black uppercase tracking-wider text-rose-300 hover:text-white transition-all cursor-pointer"
                >
                  Execute
                </button>
              </div>
            );
          }

          // Check for bullet lists
          if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            const text = line.trim().substring(2);
            return (
              <div key={idx} className="flex gap-2 text-xs text-gray-300 items-start pl-1 w-full min-w-0">
                <span className="text-primary mt-1 text-[8px]">•</span>
                <span className="flex-1 break-words">{formatTextInline(text)}</span>
              </div>
            );
          }
          // Sub-headings (e.g. ### Title)
          if (line.trim().startsWith("###")) {
            return (
              <h4 key={idx} className="text-xs font-black uppercase text-gray-400 mt-3 mb-1 tracking-wider break-words w-full">
                {formatTextInline(line.trim().substring(3).trim())}
              </h4>
            );
          }
          if (line.trim().startsWith("##")) {
            return (
              <h3 key={idx} className="text-sm font-black uppercase text-gray-300 mt-4 mb-2 tracking-wider break-words w-full">
                {formatTextInline(line.trim().substring(2).trim())}
              </h3>
            );
          }
          // Empty spacing line
          if (line.trim() === "") {
            return <div key={idx} className="h-1.5" />;
          }
          return (
            <p key={idx} className="text-xs text-gray-300 leading-relaxed break-words w-full">
              {formatTextInline(line)}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 w-full text-left">
      {sections.map((sect) => {
        const IconComponent = sect.headerIcon;
        const isUnstructured = sect.key === "unstructured";

        if (isUnstructured) {
          return (
            <div key={sect.key} className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap break-words w-full overflow-hidden">
              {sect.content.split("\n").map((line, idx) => (
                <p key={idx} className={line.trim() === "" ? "h-2" : "mb-1 break-words w-full"}>
                  {formatTextInline(line)}
                </p>
              ))}
            </div>
          );
        }

        return (
          <div 
            key={sect.key} 
            className={`rounded-2xl border p-4 transition-all duration-300 shadow-lg backdrop-blur-md ${sect.colorClass} ${sect.glowClass} hover:translate-y-[-1px] hover:shadow-xl w-full max-w-full overflow-x-auto scrollbar-thin`}
          >
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
              <IconComponent className="w-4.5 h-4.5 text-current shrink-0" />
              <h3 className="text-xs font-black tracking-widest uppercase text-white">
                {sect.title}
              </h3>
              <Sparkles className="w-3.5 h-3.5 text-white/20 ml-auto" />
            </div>
            
            <div className="text-left w-full">
              {renderSectionContent(sect)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
