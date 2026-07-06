/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Operational SaaS palette: neutral surfaces, clear blue actions.
        primary: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        sidebar: {
          bg:     '#0F172A',
          hover:  '#1E293B',
          active: '#2563EB',
          border: '#1E293B',
          text:   '#94A3B8',
          textActive: '#FFFFFF',
        },
        surface: {
          bg:     '#F8FAFC',
          card:   '#FFFFFF',
          border: '#E2E8F0',
          muted:  '#F1F5F9',
          hover:  '#F8FAFC',
        },
        // Legacy aliases used by older screens. Keep them mapped to the
        // current neutral system so every generated utility has real CSS.
        cream: {
          warm:   '#F8FAFC',
          light:  '#F1F5F9',
          medium: '#E2E8F0',
          dark:   '#CBD5E1',
        },
        ink: {
          dark:   '#0F172A',
          medium: '#475569',
          light:  '#94A3B8',
        },
        accent: {
          DEFAULT: '#2563EB',
          hover:   '#1D4ED8',
          light:   '#EFF6FF',
          orange:  '#F97316',
        },
        status: {
          available:       '#D1FAE5',
          availableText:   '#065F46',
          availableBorder: '#34D399',
          occupied:        '#FEE2E2',
          occupiedText:    '#991B1B',
          occupiedBorder:  '#FCA5A5',
          dirty:           '#FEF3C7',
          dirtyText:       '#92400E',
          dirtyBorder:     '#FCD34D',
        },
        // Keep coffee for branding elements
        coffee: {
          accent: '#2563EB',
          gold:   '#0EA5E9',
          dark:   '#0F172A',
          medium: '#475569',
          light:  '#64748B',
        },
        gray: {
          750: '#374151',
          850: '#1F2937',
        },
      },
      fontFamily: {
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #0F172A 0%, #0F172A 100%)',
        'cream-gradient': 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
        'coffee-gradient': 'linear-gradient(180deg, #0F172A 0%, #0F172A 100%)',
      },
      boxShadow: {
        'coffee':    '0 1px 2px rgba(37,99,235,0.14)',
        'coffee-sm': '0 1px 2px rgba(15,23,42,0.06)',
        'coffee-lg': '0 12px 32px rgba(15,23,42,0.16)',
        'card':      '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.06)',
        'card-hover':'0 4px 16px rgba(15,23,42,0.12)',
        'glass':     '0 8px 32px rgba(15,23,42,0.10)',
      },
      scale: {
        98: '0.98',
        102: '1.02',
      },
      animation: {
        'fade-in':       'fadeIn 0.2s ease-out',
        'slide-up':      'slideUp 0.25s ease-out',
        'slide-in-right':'slideInRight 0.25s ease-out',
        'bounce-soft':   'bounceSoft 0.3s ease-out',
        'pulse-soft':    'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:       { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:      { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        bounceSoft:   { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.04)' } },
        pulseSoft:    { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
