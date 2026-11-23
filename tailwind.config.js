/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        carbon: { DEFAULT: '#17181B', 2: '#202227', 3: '#2B2E34', texto: '#A3A8B1' },
        rojo: { DEFAULT: '#D7141F', osc: '#B0101A', suave: '#FCE8E9' },
        fondo: '#F2F3F5',
        linea: { DEFAULT: '#E2E4E8', fuerte: '#CDD1D7' },
        tinta: '#1B1D21',
        gris: { DEFAULT: '#6A707A', claro: '#9AA0A9' },
        ok: { DEFAULT: '#1E7B4F', suave: '#E5F2EB' },
        aviso: { DEFAULT: '#9A5A00', suave: '#FBF0DE' },
        info: { DEFAULT: '#2156A5', suave: '#E6EEF9' },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(23, 24, 27, 0.06)',
        modal: '0 24px 48px -12px rgba(23, 24, 27, 0.35)',
      },
    },
  },
  plugins: [],
};
