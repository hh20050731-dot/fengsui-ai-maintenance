---
name: Fengsui Digital Twin
colors:
  surface: '#0b1326'
  surface-dim: '#1e293b'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8d90a0'
  outline-variant: '#434654'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#0052d9'
  on-primary-container: '#cbd6ff'
  inverse-primary: '#0353da'
  secondary: '#b4c5ff'
  on-secondary: '#1c2e5e'
  secondary-container: '#364779'
  on-secondary-container: '#a6b7f0'
  tertiary: '#ffb59c'
  on-tertiary: '#5c1900'
  tertiary-container: '#aa3500'
  on-tertiary-container: '#ffccbc'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#021848'
  on-secondary-fixed-variant: '#334576'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832700'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
  risk-high: '#E34D59'
  risk-medium: '#f59e0b'
  risk-low: '#10b981'
  lum-border: rgba(255, 255, 255, 0.1)
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-sm:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  margin: 24px
  gutter: 16px
---

## Brand & Style

The brand identity is rooted in precision engineering, industrial reliability, and high-tech diagnostics. It is designed for operations and maintenance (O&amp;M) professionals who require real-time, mission-critical data visualization.

The design style is **Modern Industrial/Cybernetic**, combining a dark mode aesthetic with high-contrast functional highlights. It utilizes a "Digital Twin" aesthetic—meaning it prioritizes dark, non-reflective surfaces, luminescence for critical data, and a layout that mimics professional CAD or monitoring software. Key characteristics include:
- **Functional Luminescence:** Using light and color as indicators of system health (e.g., glowing red for high-risk states).
- **Structural Integrity:** A rigid grid system that conveys stability and technical accuracy.
- **Data-First Hierarchy:** Typography and spacing are optimized for rapid scanning of telemetry and diagnostic strings.

## Colors

The palette is anchored in a deep industrial dark mode. 

- **Primary & Secondary:** A range of blues (from deep cobalt to pale periwinkle) are used for navigation, active states, and structural highlights. These represent the "operating" state of the system.
- **Functional/Risk Colors:** A vibrant, saturated red (`#E34D59`) is the primary semantic color used for "High Risk" states, urgent warnings, and fault simulations. This color should be used sparingly but aggressively to draw immediate attention.
- **Surface Strategy:** Backgrounds use a very dark navy (`#0f172a`), while containers use a slightly lighter slate (`#1e293b`) to create subtle depth without relying on traditional shadows.
- **Borders:** Instead of solid fills, use "Luminance Borders"—semi-transparent white or primary-tinted lines that give the UI a lightweight, technical feel.

## Typography

The system uses a dual-font approach to balance readability with technical aesthetics.

- **Hanken Grotesk:** Used for all primary UI elements, headlines, and body text. It provides a clean, modern, and highly legible foundation.
- **JetBrains Mono:** Reserved specifically for telemetry data, equipment IDs, file paths, and sensor readings. The monospaced nature emphasizes the "data-driven" aspect of the platform.
- **Labeling:** Small, uppercase labels with increased letter spacing are used for secondary headers (e.g., panel titles) to create a clear structural hierarchy without needing large font sizes.

## Layout & Spacing

The layout follows a **Fixed Dashboard** model designed for widescreen desktop monitoring.

- **Side Navigation:** A 256px (16rem) fixed sidebar for primary platform modules.
- **Top Navigation:** A 64px (4rem) utility bar for breadcrumbs and user actions.
- **Main Viewport:** A three-column panel system. The left panel (256px) handles context and scenarios; the center flexes to maximize the 3D WebGL viewport; the right panel (320px) handles live telemetry and AI diagnostics.
- **Bottom Shelf:** A 192px (12rem) horizontal dock for historical trend charts.
- **Spacing Rhythm:** Uses a strict 8px grid. Most internal container padding is 16px (`md`), while the gap between major layout panels is 24px (`lg`).

## Elevation & Depth

In this dark-mode industrial system, elevation is conveyed through **Tonal Layering** and **Luminance** rather than traditional shadows.

- **The Base:** The lowest level is the `#0f172a` background.
- **Containers:** Panels are elevated using the `#1e293b` surface color and defined by `1px` semi-transparent borders (`rgba(255, 255, 255, 0.1)`). 
- **Glow Effects:** High-criticality elements (like the 3D viewport during a fault) use an outer "ambient glow" (e.g., `box-shadow: 0 0 15px rgba(227, 77, 89, 0.2)`) to simulate light emission from a screen or warning light.
- **Interactive States:** Hover states should use a background tint (e.g., `white/5%` or `primary/10%`) to indicate clickability.

## Shapes

The shape language is **Technical and Sharp**.

- **Standard Radius:** 2px (`rounded-sm`) to 4px (`rounded`) is the default for most buttons and small containers, maintaining a precise, engineered look.
- **Panel Radius:** Large content panels use an 8px (`rounded-lg`) radius to slightly soften the overall interface and distinguish major UI sections.
- **Pills:** Only used for status indicators or specific "Sync" buttons to provide a distinct visual affordance compared to structural elements.

## Components

- **Buttons:** Primary buttons for emergency actions (e.g., "Create Work Order") use a solid fill of the risk-red color. Secondary buttons use a transparent background with a primary-tinted border.
- **Fault Scenarios (List Items):** These should include a vertical "status bar" on the left edge (4px wide) to color-code the severity of the state. Active items use a subtle background highlight.
- **Telemetry Cards:** Grid-based layouts within panels. Each metric should have a clear label (Hanken Grotesk) and a larger value (JetBrains Mono).
- **Luminance Borders:** All panels must have a `1px` border using `rgba(255, 255, 255, 0.1)`. This is the signature stylistic element of the system.
- **Status Dots:** Small 8px circles used for "Live" indicators, with an `animate-pulse` effect for critical warnings.
- **3D Viewport Controls:** Floating, semi-transparent overlays with sharp corners and thin borders.