---
name: Fengsui Command Center System
colors:
  surface: '#091422'
  surface-dim: '#091422'
  surface-bright: '#2f3a49'
  surface-container-lowest: '#040f1d'
  surface-container-low: '#111c2b'
  surface-container: '#15202f'
  surface-container-high: '#202b3a'
  surface-container-highest: '#2b3545'
  on-surface: '#d8e3f7'
  on-surface-variant: '#bcc8cf'
  inverse-surface: '#d8e3f7'
  inverse-on-surface: '#263140'
  outline: '#869399'
  outline-variant: '#3d494e'
  surface-tint: '#55d5ff'
  primary: '#8fe0ff'
  on-primary: '#003544'
  primary-container: '#28c8f5'
  on-primary-container: '#005065'
  inverse-primary: '#006780'
  secondary: '#44ebb8'
  on-secondary: '#003829'
  secondary-container: '#03ce9e'
  on-secondary-container: '#00523d'
  tertiary: '#ffcc89'
  on-tertiary: '#452b00'
  tertiary-container: '#f8a926'
  on-tertiary-container: '#674200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b9eaff'
  primary-fixed-dim: '#55d5ff'
  on-primary-fixed: '#001f29'
  on-primary-fixed-variant: '#004d61'
  secondary-fixed: '#5bfcc9'
  secondary-fixed-dim: '#33dfae'
  on-secondary-fixed: '#002116'
  on-secondary-fixed-variant: '#00513c'
  tertiary-fixed: '#ffddb4'
  tertiary-fixed-dim: '#ffb955'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#633f00'
  background: '#091422'
  on-background: '#d8e3f7'
  surface-variant: '#2b3545'
typography:
  display-lg:
    fontFamily: notoSans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: notoSans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: notoSans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: notoSans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-display:
    fontFamily: jetbrainsMono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  data-label:
    fontFamily: jetbrainsMono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-page: 24px
  panel-padding: 20px
---

## Brand & Style

The design system is engineered for mission-critical industrial monitoring and high-speed rail dispatching environments. It evokes a sense of absolute precision, real-time authority, and "future-industrial" sophistication. The interface functions as a "Digital Twin Hub," prioritizing data density without sacrificing clarity.

The visual style is **High-Tech Industrial Minimalism** mixed with **Glassmorphism**. It utilizes a deep-space backdrop to minimize eye strain during long shifts, while employing "glowing networks" and "radar pulses" to draw immediate attention to system anomalies. Surfaces are treated as semi-transparent head-up display (HUD) layers, creating a sense of depth and multi-dimensional data mapping.

## Colors

The palette is anchored in deep navy and "True Black" to provide maximum contrast for luminous data elements. 

- **Primary Tech (Cyan):** Used for active states, data connections, and primary telemetry.
- **Functional Status:** A semantic traffic-light system is used for Health (Green), Warning (Orange), and Critical Risk (Red). 
- **Surface Layering:** The main panels use a semi-transparent dark blue fill with a subtle "cool-white" border to simulate reinforced glass.
- **Glow Effects:** Critical risks and active nodes should utilize a 4-8px outer glow (drop-shadow) using their respective hex codes to simulate hardware LED indicators.

## Typography

This design system employs a dual-font strategy to balance human readability with technical precision.

- **Humanist Layer (Noto Sans):** Used for all UI labels, navigation, and descriptive text. It ensures maximum legibility in high-pressure environments.
- **Technical Layer (JetBrains Mono):** This monospaced font is strictly reserved for device IDs, coordinates, timestamps, and live telemetry data. The fixed character width prevents "layout jumping" when data values update rapidly.
- **Hierarchy:** Use `data-label` in All-Caps for secondary metadata to reinforce the industrial "stamped" aesthetic.

## Layout & Spacing

The layout follows a **Fluid Grid** model designed for ultra-wide command center displays. 

- **Grid:** A 24-column grid provides the granularity needed for complex dashboard tiling.
- **Modular Panels:** Content must be encapsulated in panels. Panels should snap to grid increments. 
- **Density:** Spacing is compact (4px base unit) to allow for the "High Information Density" required by O&M specialists.
- **Responsive Behavior:** On smaller displays, sidebars collapse into icon-only rails, and secondary telemetry panels stack vertically while maintaining their 16px gutter.

## Elevation & Depth

Depth is achieved through **Glassmorphism** and **Tonal Layering** rather than traditional shadows.

- **Base Level:** `#06111F` (Solid background).
- **Floor Level:** Sub-grid lines and "radar pulses" appear to move behind the panels.
- **Panel Level:** `rgba(12, 32, 52, 0.92)` with a subtle backdrop-blur (12px-20px).
- **Active Level:** Elements in focus or "Critical" state receive an additive light effect (Linear Dodge) and a cyan or red outer glow. 
- **Overlays:** Modals and tooltips use a higher transparency and a brighter border (`rgba(72, 183, 226, 0.4)`) to appear physically closer to the operator.

## Shapes

The shape language reflects industrial precision—clean, structured, and deliberate.

- **Panels:** Use a standard 8px-10px radius. This "Soft-Industrial" corner prevents the UI from feeling overly aggressive while maintaining a professional structure.
- **Interactive Elements:** Buttons and input fields follow the `rounded-md` (8px) standard.
- **Nodes:** Status indicators and data points are perfectly circular, often encased in a secondary "halo" ring to indicate pulse activity.
- **Progress Lines:** Terminals of rail-style trackers should be squared off or utilize a 45-degree "chamfered" look to mimic engineering schematics.

## Components

- **Panels:** Default state includes a 1px border `rgba(72, 183, 226, 0.18)`. Hovering over a panel should brighten the border to `Active Border` strength.
- **Buttons:** Primary buttons use a Cyan solid fill with dark text. Secondary buttons are "Ghost" style with a Cyan border. Hover states trigger a weak cyan glow band behind the text.
- **Status Nodes:** 
    - *Healthy:* Static Green dot.
    - *Critical:* Red dot with a concentric "ripple" animation (pulse) that expands and fades out.
- **Rail Progress Trackers:** Inspired by rail lines. Completed segments are solid Cyan; upcoming segments are dashed lines.
- **Data Inputs:** Dark backgrounds with a bottom-only border. On focus, the bottom border glows Cyan and a very faint vertical gradient rises from the base.
- **Cards/Tiles:** Used for device snapshots. Must include a `JetBrains Mono` ID tag in the top-right corner with 60% opacity.