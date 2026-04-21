"use client";

export function getTheme(): "light" | "dark" {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

export function setTheme(theme: "light" | "dark") {
  if (typeof window !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }
}

export function initTheme() {
  if (typeof window !== "undefined") {
    const theme = getTheme();
    document.documentElement.setAttribute("data-theme", theme);
  }
}
