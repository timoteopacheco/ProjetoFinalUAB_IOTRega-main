import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';

// Wraps Leaflet.draw imperatively since there is no maintained
// react-leaflet-draw build for react-leaflet v5 / React 19.
export default function DrawControl({ onCreated }) {
  const map = useMap();
  const groupRef = useRef(null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    groupRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: false,
      },
    });
    map.addControl(drawControl);

    const handleCreated = (e) => {
      drawnItems.addLayer(e.layer);
      onCreatedRef.current?.(e.layer.toGeoJSON().geometry, e.layer);
    };
    map.on(L.Draw.Event.CREATED, handleCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map]);

  return null;
}
