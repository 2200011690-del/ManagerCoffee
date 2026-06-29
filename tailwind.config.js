/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // KiotViet/Sapo blue palette
        // Warm Coffee & Cream palette
        primary: {
          50:  '#FAF6F0',
          100: '#F3EAD8',
          200: '#E5D3B3',
          300: '#D4B895',
          400: '#C29C75',
          500: '#A76D42', // Original coffee color
          600: '#8C5E3C', // Warm rich coffee brown
          700: '#734A2E', // Espresso brown
          800: '#5A3822', // Dark roast
          900: '#432918',
        },
        sidebar: {
          bg:     '#1F1610',
          hover:  '#2D2017',
          active: '#8C5E3C',
          border: '#2D2017',
          text:   '#A39081',
          textActive: '#FFFFFF',
        },
        surface: {
          bg:     '#FCFBF9',
          card:   '#FFFFFF',
          border: '#EFEAE2',
          muted:  '#FAF7F2',
          hover:  '#FCFBF9',
        },
        ink: {
          dark:   '#2C1A10',
          medium: '#5C4E43',
          light:  '#A39081',
        },
        accent: {
          DEFAULT: '#A76D42',
          hover:   '#8C5E3C',
          light:   '#FAF6F0',
          orange:  '#F97316',
        },
        cream: {
          light:  '#FAF7F2',
          medium: '#EFEAE2',
          warm:   '#F7F2EA',
          dark:   '#E5DDD0',
        },
        status: {
          available:       '#E8F5E9',
          availableText:   '#2E7D32',
          availableBorder: '#81C784',
          occupied:        '#FFEBEE',
          occupiedText:    '#C62828',
          occupiedBorder:  '#E57373',
          dirty:           '#FFF8E1',
          dirtyText:       '#F57F17',
          dirtyBorder:     '#F57F17',
        },
        // Keep coffee for branding elements
        coffee: {
          accent: '#A76D42',
          gold:   '#D4A373',
          dark:   '#2C1A10',
          medium: '#5C4E43',
          light:  '#A39081',
        },
      },
      fontFamily: {
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #A76D42 0%, #D4A373 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #2C1A10 0%, #1F1610 100%)',
        'cream-gradient': 'linear-gradient(135deg, #FAF7F2 0%, #EFEAE2 100%)',
        'coffee-gradient': 'linear-gradient(180deg, #2C1A10 0%, #1F1610 100%)',
      },
      boxShadow: {
        'coffee':    '0 4px 20px rgba(167,109,66,0.15)',
        'coffee-lg': '0 8px 40px rgba(167,109,66,0.25)',
        'card':      '0 1px 3px rgba(44,26,16,0.08), 0 1px 2px rgba(44,26,16,0.06)',
        'card-hover':'0 4px 16px rgba(44,26,16,0.12)',
        'glass':     '0 8px 32px rgba(44,26,16,0.10)',
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
