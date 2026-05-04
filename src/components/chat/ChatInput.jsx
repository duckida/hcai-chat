"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChatInput({ onSend, isLoading }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "52px";
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    const el = e.target;
    setInput(el.value);
    el.style.height = "52px";
    const newHeight = Math.min(el.scrollHeight, 220);
    el.style.height = `${newHeight}px`;
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white/70 backdrop-blur-xl pb-8 pt-8 px-4 z-30">
      <div className="max-w-[700px] mx-auto relative flex items-end">
        <div className="relative w-full flex items-center bg-[#f4f4f4] rounded-[28px] border border-transparent focus-within:bg-white focus-within:border-[#ececec] focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all overflow-hidden p-[5px]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Hack Club AI"
            className="w-full bg-transparent border-none outline-none shadow-none resize-none py-[15px] px-[20px] min-h-[52px] h-[52px] text-[15px] text-[#212121] placeholder:text-slate-400 leading-[1.4] overflow-y-auto block font-medium"
            rows={1}
          />
          <div className="flex items-center pr-2 pb-1.5 self-end">
            <Button
              size="icon"
              disabled={!input.trim() || isLoading}
              onClick={handleSend}
              className={`h-8.5 w-8.5 rounded-full transition-all ${
                input.trim() && !isLoading
                  ? "bg-[#0f172a] text-white hover:bg-black shadow-md"
                  : "bg-[#e5e5e5] text-[#a0a0a0] cursor-not-allowed"
              }`}
            >
              <ArrowUp className="w-5 h-5 stroke-[2.5]" />
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className="text-[11px] text-slate-400 font-bold tracking-tight opacity-70">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
