# MiragePaint

Vektor-Grafikeditor (Angular) – Port der MiragePaint/FusionPaint-Algorithmen mit Freihand, geometrischen Formen, Undo, Zoom sowie PNG-/SVG-Export.

## Start

```bash
npm start
```

App unter `http://localhost:4200/`.

## Bedienung

- Werkzeuge links: Auswahl, Freihand, Linie, Rechteck, Ellipse, Dreieck sowie Effekt-Tools (Octopussy, MultiStar, …)
- Drag zum Zeichnen; bei Effekten bestimmt die Drag-Richtung den Startwinkel
- Auswahl: verschieben, Skalierungs-Handles, Rotations-Handle
- Zoom: Mausrad / Topbar; Pan: Leertaste + Ziehen oder Mittelklick
- Speichern: JSON-Download + localStorage; Export: SVG / PNG
