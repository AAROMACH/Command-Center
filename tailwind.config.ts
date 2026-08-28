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
        mono: ['JetBrains Mono', 'monospace'],
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
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-elevated': 'var(--bg-elevated)',
        'brand-red': 'var(--brand-red)',
        'brand-red-hover': 'var(--brand-red-hover)',
        'brand-red-dim': 'var(--brand-red-dim)',
        'brand-cyan': 'var(--brand-cyan)',
        'brand-blue': 'var(--brand-blue)',
        'brand-emerald': 'var(--brand-emerald)',
        'brand-purple': 'var(--brand-purple)',
        'priority-critical': 'var(--priority-critical)',
        'priority-high': 'var(--priority-high)',
        'priority-medium': 'var(--priority-medium)',
        'priority-low': 'var(--priority-low)',
        'accent-gold': 'var(--accent-gold)',
        'accent-gold-dim': 'var(--accent-gold-dim)',
        'green-dim': 'var(--green-dim)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-red': 'var(--text-red)',
        'text-gold': 'var(--text-gold)',
        'text-green': 'var(--text-green)',
        'border-default': 'var(--border-main)',
        'border-main': 'var(--border-main)',
        'border-sub': 'var(--border-sub)',
        'border-alert': 'var(--border-alert)',
        'border-gold': 'var(--border-gold)',
        'border-red': 'var(--brand-red)',
        'border-green': 'var(--border-green)',
        'green-border': 'var(--green-border)',
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