# Map data and attribution

These sources match the configured style endpoints and the providers' official
documentation.

## Light and dark styles

- Style endpoints: OpenFreeMap `positron` and `fiord`.
- Visible attribution: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`.
- OpenFreeMap's official integration guide requires attribution and gives this
  exact form.
- OpenMapTiles requires attribution to both OpenMapTiles and the original
  OpenStreetMap data.
- The OpenStreetMap link points to its copyright page, which includes the ODbL
  terms.

Official references:

- <https://openfreemap.org/quick_start/>
- <https://openmaptiles.org/docs/>
- <https://www.openstreetmap.org/copyright>

## Aerial style

- Live style endpoint:
  `https://tiles.versatiles.org/assets/styles/satellite/style.json`.
- The live style identifies its raster source as `VersaTiles - Satellite +
  Orthophotos`, links imagery attribution to the complete VersaTiles source
  list, and also overlays OpenStreetMap Shortbread vector data.
- Visible attribution therefore links both `VersaTiles sources` and
  `© OpenStreetMap contributors`.
- The style metadata is public-domain/CC0, but the imagery source licenses and
  credits still apply individually.

Official references:

- <https://docs.versatiles.org/basics/tilesets.html>
- <https://versatiles.org/sources/>
- <https://www.openstreetmap.org/copyright>

## Operational risk

Both providers are remote runtime dependencies. The VersaTiles public style URL
is not version-pinned and its own documentation warns that public assets can
change. The application provides a visible map-load error and retry action.
Pinning or self-hosting map assets remains an additional reliability option.
