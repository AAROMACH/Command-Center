import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      fontFamily: {
        // Resolves to whichever font the signed-in user picked in Settings
        // (applied as a CSS var via [data-font] in globals.css); falls back
        // to Inter until that's set.
        sans: ['var(--app-font)', 'Inter', 'sans-serif'],
        // Same idea — most of the app's actual digits (schedule dates/times,
        // IDs, pay amounts) render with font-mono, so this needs to follow
        // the chosen font too, not just body text.
        mono: ['var(--app-mono-font)', 'JetBrains Mono', 'monospace'],
        // Fixed per-font utilities — only used to render each option's own
        // preview text in the font picker, not for the toggle itself.
        inter: ['Inter', 'sans-serif'],
        atkinson: ['Atkinson Hyperlegible', 'sans-serif'],
        lexend: ['Lexend', 'sans-serif'],
        plex: ['IBM Plex Sans', 'sans-serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // From Spec
        'bg-primary': 'rgb(var(--bg-primary-rgb) / <alpha-value>)',
        'bg-secondary': 'rgb(var(--bg-secondary-rgb) / <alpha-value>)',
        'bg-tertiary': 'rgb(var(--bg-tertiary-rgb) / <alpha-value>)',
        'bg-elevated': 'rgb(var(--bg-elevated-rgb) / <alpha-value>)',
        'brand-red': 'rgb(var(--brand-red-rgb) / <alpha-value>)',
        'brand-red-hover': 'rgb(var(--brand-red-hover-rgb) / <alpha-value>)',
        'brand-red-dim': 'rgb(var(--brand-red-dim-rgb) / <alpha-value>)',
        'brand-cyan': 'rgb(var(--brand-cyan-rgb) / <alpha-value>)',
        'brand-blue': 'rgb(var(--brand-blue-rgb) / <alpha-value>)',
        'brand-emerald': 'rgb(var(--brand-emerald-rgb) / <alpha-value>)',
        'brand-purple': 'rgb(var(--brand-purple-rgb) / <alpha-value>)',
        'priority-critical': 'rgb(var(--priority-critical-rgb) / <alpha-value>)',
        'priority-high': 'rgb(var(--priority-high-rgb) / <alpha-value>)',
        'priority-medium': 'rgb(var(--priority-medium-rgb) / <alpha-value>)',
        'priority-low': 'rgb(var(--priority-low-rgb) / <alpha-value>)',
        'accent-gold': 'rgb(var(--accent-gold-rgb) / <alpha-value>)',
        'accent-gold-dim': 'rgb(var(--accent-gold-dim-rgb) / <alpha-value>)',
        'green-dim': 'rgb(var(--green-dim-rgb) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        'text-red': 'rgb(var(--text-red-rgb) / <alpha-value>)',
        'text-gold': 'rgb(var(--text-gold-rgb) / <alpha-value>)',
        'text-green': 'rgb(var(--text-green-rgb) / <alpha-value>)',
        'border-default': 'rgb(var(--border-main-rgb) / <alpha-value>)',
        'border-main': 'rgb(var(--border-main-rgb) / <alpha-value>)',
        'border-sub': 'rgb(var(--border-sub-rgb) / <alpha-value>)',
        'border-alert': 'rgb(var(--border-alert-rgb) / <alpha-value>)',
        'border-gold': 'rgb(var(--border-gold-rgb) / <alpha-value>)',
        'border-red': 'rgb(var(--brand-red-rgb) / <alpha-value>)',
        'border-green': 'rgb(var(--border-green-rgb) / <alpha-value>)',
        'green-border': 'rgb(var(--green-border-rgb) / <alpha-value>)',
        // Names used in pages that never existed (rendered nothing): map to the theme.
        'gold-border': 'rgb(var(--border-gold-rgb) / <alpha-value>)',
        'amber': 'rgb(var(--accent-gold-rgb) / <alpha-value>)',
        'text-amber': 'rgb(var(--text-gold-rgb) / <alpha-value>)',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: {
            DEFAULT: 'hsl(var(--sidebar-primary))',
            foreground: 'hsl(var(--sidebar-primary-foreground))',
          },
          accent: {
            DEFAULT: 'hsl(var(--sidebar-accent))',
            foreground: 'hsl(var(--sidebar-accent-foreground))',
          },
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;