"use client";

import { useEffect, useRef } from "react";

export function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = [];
    const particleCount = Math.floor((width * height) / 9000);

    const mouse = { x: -1000, y: -1000, radius: 180 };
    let isLightMode = document.documentElement.getAttribute("data-theme") === "light";
    // Streaming state: 0 = idle, 1 = thinking/streaming
    let streamIntensity = 0;
    let streamTarget = 0;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === "data-theme") {
          isLightMode = (m.target as HTMLElement).getAttribute("data-theme") === "light";
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Listen for streaming events dispatched from ChatPanel
    const handleStreamStart = () => { streamTarget = 1; };
    const handleStreamEnd   = () => { streamTarget = 0; };
    window.addEventListener("ai-stream-start", handleStreamStart);
    window.addEventListener("ai-stream-end",   handleStreamEnd);

    class Particle {
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      size: number;
      density: number;
      alpha: number;
      baseAlpha: number;
      colorIndex: number;
      phase: number; // for pulsing

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.baseX = this.x;
        this.baseY = this.y;
        this.size = Math.random() * 1.5 + 0.5;
        this.density = (Math.random() * 20) + 5;
        this.baseAlpha = Math.random() * 0.5 + 0.1;
        this.alpha = this.baseAlpha;
        this.colorIndex = Math.floor(Math.random() * 3);
        this.phase = Math.random() * Math.PI * 2;
      }

      draw() {
        if (!ctx) return;

        const darkColors = [
          `rgba(164, 141, 255, ${this.alpha})`,
          `rgba(100, 70, 240, ${this.alpha})`,
          `rgba(220, 200, 255, ${this.alpha})`
        ];

        const lightColors = [
          `rgba(109, 40, 217, ${this.alpha})`,
          `rgba(124, 92, 252, ${this.alpha})`,
          `rgba(88, 51, 230, ${this.alpha})`
        ];

        // During streaming: shift toward cyan/teal
        const streamColors = [
          `rgba(56, 189, 248, ${this.alpha})`,
          `rgba(34, 211, 238, ${this.alpha})`,
          `rgba(99, 102, 241, ${this.alpha})`
        ];

        let currentColor: string;
        if (streamIntensity > 0.5) {
          // Lerp between normal and stream colors based on intensity
          currentColor = streamColors[this.colorIndex];
        } else {
          const baseColors = isLightMode ? lightColors : darkColors;
          currentColor = baseColors[this.colorIndex];
        }

        const glowSize = streamIntensity > 0 ? 10 + streamIntensity * 18 : 10;
        ctx.fillStyle = currentColor;
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = currentColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 + streamIntensity * 0.5), 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      update(frame: number) {
        // Pulse alpha when streaming
        this.phase += 0.03 + streamIntensity * 0.07;
        if (streamIntensity > 0) {
          this.alpha = this.baseAlpha + Math.sin(this.phase) * streamIntensity * 0.35;
          this.alpha = Math.max(0.05, Math.min(1, this.alpha));
        } else {
          this.alpha = this.baseAlpha;
        }

        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance < mouse.radius) {
          const forceDirectionX = dx / distance;
          const forceDirectionY = dy / distance;
          const force = (mouse.radius - distance) / mouse.radius;
          const directionX = forceDirectionX * force * this.density;
          const directionY = forceDirectionY * force * this.density;
          this.x -= directionX;
          this.y -= directionY;
        } else {
          if (this.x !== this.baseX) {
            const dxBase = this.x - this.baseX;
            this.x -= dxBase / 25;
          }
          if (this.y !== this.baseY) {
            const dyBase = this.y - this.baseY;
            this.y -= dyBase / 25;
          }
        }

        // Float upward faster during streaming
        const riseSpeed = 0.15 + streamIntensity * 0.4;
        this.baseY -= riseSpeed;
        if (this.baseY < -10) {
          this.baseY = height + 10;
          this.y = height + 10;
          this.x = Math.random() * width;
          this.baseX = this.x;
        }

        this.draw();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      particles.length = 0;
      const newCount = Math.floor((width * height) / 9000);
      for (let i = 0; i < newCount; i++) {
        particles.push(new Particle());
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    let animationFrameId: number;
    let frame = 0;

    function animate() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Smooth lerp intensity toward target
      streamIntensity += (streamTarget - streamIntensity) * 0.04;

      for (let i = 0; i < particles.length; i++) {
        particles[i].update(frame);
      }
      frame++;
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("ai-stream-start", handleStreamStart);
      window.removeEventListener("ai-stream-end",   handleStreamEnd);
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: -1,
      pointerEvents: "none",
      background: "var(--galaxy-bg)"
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%"
        }}
      />
    </div>
  );
}
