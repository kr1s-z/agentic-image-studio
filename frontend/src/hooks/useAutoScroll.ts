import { useRef, useEffect, useState, useCallback } from "react";

export function useAutoScroll<T extends HTMLElement>(depLength: number) {
  const containerRef = useRef<T>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setUserScrolled(!atBottom);
  }, []);

  useEffect(() => {
    if (!userScrolled && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [depLength, userScrolled]);

  return { containerRef, userScrolled, handleScroll };
}
