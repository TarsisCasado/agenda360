import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */

// Cores semanticas vindas de CSS custom properties (ver src/index.css).
// O tema (light/dark) e definido UMA vez la; aqui so expomos os tokens ao
// Tailwind. Assim `bg-surface`, `text-secondary` e `border-hairline` funcionam
// nos dois temas sem `dark:` duplicado em cada classe — que era a origem da
// inconsistencia visual entre telas.
const token = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Superficies em camadas
        canvas: token('--c-canvas'),
        surface: token('--c-surface'),
        'surface-2': token('--c-surface-2'),
        'surface-3': token('--c-surface-3'),
        hairline: token('--c-hairline'),
        // Quadro de fluxo (CP5.3)
        board: token('--c-board'),
        'board-card': token('--c-board-card'),
        // Texto
        primary: token('--c-text'),
        secondary: token('--c-text-2'),
        muted: token('--c-text-3'),
        faint: token('--c-text-4'),
        // Acento e semanticas
        accent: {
          DEFAULT: token('--c-accent'),
          soft: token('--c-accent-soft'),
          text: token('--c-accent-text'),
        },
        positive: token('--c-positive'),
        warning: token('--c-warning'),
        danger: token('--c-danger'),
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      // Escala de raio consistente: sm(controles) / md(linhas) / lg(superficies)
      // / xl(folhas). Nada de radius gigante em tudo.
      borderRadius: {
        control: '10px',
        row: '14px',
        surface: '18px',
        sheet: '26px',
      },
      // Elevacao: apenas 2 niveis reais (o resto separa por COR, nao por sombra).
      boxShadow: {
        raised: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px -6px rgb(0 0 0 / 0.10)',
        float: '0 8px 40px -12px rgb(0 0 0 / 0.28)',
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [
    // `short:` = viewport BAIXA, nao estreita. O iPhone deitado tem 844px de
    // largura e 390px de altura: e "desktop" por largura e apertadissimo por
    // altura. Sem isto, o cabecalho da pagina + filtros + etapas comiam 215 dos
    // 390px e sobrava uma faixa de quadro sem uso. Media query de ALTURA e a
    // unica que separa esse caso.
    plugin(({ addVariant }) => addVariant('short', '@media (max-height: 520px)')),
  ],
}
