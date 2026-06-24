/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coffee: {
          darkest: '#1A0F0A',
          dark: '#2C1B14',
          medium: '#4A2C1A',
          light: '#7B4F35',
          accent: '#A76D42',
          gold: '#C8956C',
        },
        cream: {
          warm: '#FAF7F2',
          light: '#F5EFE6',
          medium: '#EDE3D4',
          dark: '#D4C4AE',
        },
        status: {
          available: '#D1FAE5',
          availableText: '#065F46',
          availableBorder: '#6EE7B7',
          occupied: '#FFE4E6',
          occupiedText: '#9F1239',
          occupiedBorder: '#FECDD3',
          dirty: '#FEF3C7',
          dirtyText: '#92400E',
          dirtyBorder: '#FDE68A',
        }
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'coffee-gradient': 'linear-gradient(135deg, #2C1B14 0%, #4A2C1A 50%, #2C1B14 100%)',
        'cream-gradient': 'linear-gradient(135deg, #FAF7F2 0%, #F5EFE6 100%)',
        'accent-gradient': 'linear-gradient(135deg, #A76D42 0%, #C8956C 100%)',
      },
      boxShadow: {
        'coffee': '0 4px 20px rgba(44, 27, 20, 0.15)',
        'coffee-lg': '0 8px 40px rgba(44, 27, 20, 0.25)',
        'card': '0 2px 12px rgba(44, 27, 20, 0.08)',
        'card-hover': '0 8px 30px rgba(44, 27, 20, 0.18)',
        'glass': '0 8px 32px rgba(44, 27, 20, 0.12)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'bounce-soft': 'bounceSoft 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
