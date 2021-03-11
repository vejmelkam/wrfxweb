import {map, baseLayerDict, dragElement, overlay_list} from '../util.js';
import {currentDomain, current_display, current_timestamp, currentSimulation, rasters, raster_base, sorted_timestamps, organization} from './Controller.js';

/**
 * Component that handles adding and removing layers to the map. Provides user with a window
 * to choose different layers available to add. 
 */
export class LayerController extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `
            <link rel="stylesheet" href="css/layerController.css"/>
            <div id='layer-controller-container'>
                <div id='base-maps' class='layer-group' style='border-bottom: 2px'>
                    <span>Base Maps</span>
                    <div id='map-checkboxes' class='layer-list'>
                    </div>
                </div>
                <div id='raster-layers' class='layer-group'>
                    <span>Rasters</span>
                    <div id='raster-checkboxes' class='layer-list'>
                    </div>
                </div>
                <div id='overlay-layers' class='layer-group'>
                    <span>Overlays</span>
                    <div id='overlay-checkboxes' class='layer-list'>
                    </div>
                </div>
            </div>
        `;
        this.mapType = 'OSM';
        this.currentSimulation = '';
        this.overlayDict = {};
        this.rasterDict = {};
        this.imgCanvas = document.createElement('canvas');
        this.clrBarCanvas = document.createElement('canvas');
        this.displayedColorbar = null; // name of layer currently displaying its colorbar (maybe display multiple cbs?)
        this.displayedColorbars = [];
        this.markerIcon = L.icon({iconUrl: 'icons/square_icon_filled.png', iconSize: [5,5]});
        this.markers = [];
        this.overlayOrder = [];
    }

    /** Disable map events from within the layer selection window to prevent unwanted zooming
     * and panning. */
    connectedCallback() {
        const layerController = this.querySelector('#layer-controller-container');
        dragElement(layerController, '');
        L.DomEvent.disableClickPropagation(layerController);
        L.DomEvent.disableScrollPropagation(layerController);

        currentDomain.subscribe(() => this.domainSwitch());
        current_timestamp.subscribe(() => this.updateMarkers());
        this.buildMapBase();
    }


    /** Called when a layer is selected. */
    handleOverlayadd(name, layer) {
        // register in currently displayed layers and bring to front if it's an overlay
        console.log('name ' + name + ' layer ' + layer);
        layer.addTo(map);
        current_display.getValue()[name] = layer;
        if(overlay_list.indexOf(name) >= 0) {
            layer.bringToFront();
        } else {
            layer.bringToBack();
        }

        // if the overlay being added now has a colorbar and there is none displayed, show it
        var rasters_now = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        if('colorbar' in rasters_now[name]) {
            var cb_url = raster_base.getValue() + rasters_now[name].colorbar;
            const rasterColorbar = document.querySelector('#raster-colorbar');
            rasterColorbar.src = cb_url;
            rasterColorbar.style.display = 'block';
            this.displayedColorbar = name;
            this.displayedColorbars.push({name: name, url: cb_url});
            var img = layer._image;
            img.ondblclick = (e) => {
                var latLon = map.mouseEventToLatLng(e);
                e.stopPropagation();
                var popUp = L.popup({closeOnClick: false, autoClose: false}).setLatLng([latLon.lat, latLon.lng]).openOn(map);
                popUp.imageCoords = {layerX: e.layerX /img.width, layerY: e.layerY / img.height};
                this.updateMarker(popUp);
                this.markers.push(popUp);
            }
            img.onload = () => {
                this.drawCanvas(img);
                this.updateMarkers();
            }
            map.on('zoomend', () => this.drawCanvas(img));
            this.drawCanvas(img);
            this.updateMarkers();
        }
        this.overlayOrder.push(layer);
    }

    drawCanvas(img) {
        this.imgCanvas = null;
        if (img != null) {
            this.imgCanvas = document.createElement('canvas');
            this.imgCanvas.width = img.width;
            this.imgCanvas.height = img.height;
            this.imgCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
        }
    }

    updateMarkers() {
        this.markers.map(marker => {
            this.updateMarker(marker);
        });
    }

    updateMarker(marker) {
        var popupContent = "No layer bar with colobar to show values of";
        if (this.imgCanvas) {
            var imageCoords = marker.imageCoords;
            var xCoord = Math.floor(imageCoords.layerX * this.imgCanvas.width);
            var yCoord = Math.floor(imageCoords.layerY * this.imgCanvas.height);
            var pixelData = this.imgCanvas.getContext('2d').getImageData(xCoord, yCoord, 1, 1).data;
            popupContent = `<p style="color: rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})">R:${pixelData[0]} G:${pixelData[1]} B:${pixelData[2]}</p>`;
        }
        marker.setContent(popupContent);
    }

    /** Called when a new domain is selected or a new simulation is selected. */
    domainSwitch() {
        for(var layerName in current_display.getValue()) {
            this.handleOverlayRemove(layerName, current_display.getValue()[layerName]);
        }
        var prevDisplay = current_display.getValue();
        if (this.currentSimulation != currentSimulation.getValue()) {
            prevDisplay = {};
            this.currentSimulation = currentSimulation.getValue();
            this.querySelector('#layer-controller-container').style.display = 'block';
        }
        current_display.setValue({});
        var first_rasters = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var vars = Object.keys(first_rasters);
        var cs = first_rasters[vars[0]].coords;
        map.fitBounds([ [cs[0][1], cs[0][0]], [cs[2][1], cs[2][0]] ]);
 
        // build the layer groups
        this.rasterDict = {};
        this.overlayDict = {};    
        Object.entries(first_rasters).map(entry => {
            var r = entry[0];
            var raster_info = first_rasters[r];
            var cs = raster_info.coords;
            var layer = L.imageOverlay(raster_base.getValue() + raster_info.raster,
                                        [[cs[0][1], cs[0][0]], [cs[2][1], cs[2][0]]],
                                        {
                                            attribution: organization.getValue(),
                                            opacity: 0.5,
                                            interactive: true
                                        });
            if(r in prevDisplay) current_display.getValue()[r] = layer;
            if(overlay_list.indexOf(r) >= 0) {
                this.overlayDict[r] = layer;
            } else {
                this.rasterDict[r] = layer;
            }
        });
        this.buildLayerBoxes();
    }

    /** Adds checkboxes for the different available map types. Should only be called once after
     * the map has been initialized. */
    buildMapBase() {
        const baseMapDiv = this.querySelector('#map-checkboxes');
        for (const [name, layer] of Object.entries(baseLayerDict)) {
            let mapCheckBox = this.buildMapCheckBox(name, layer);
            baseMapDiv.appendChild(mapCheckBox);
        }
    }

    /** Builds a checkbox for each raster layer and overlay layer */
    buildLayerBoxes() {
        const rasterRegion = this.querySelector('#raster-layers');
        rasterRegion.style.display = 'block';
        if (Object.keys(this.rasterDict).length == 0) rasterRegion.style.display = 'none';

        const overlayRegion = this.querySelector('#overlay-layers');
        overlayRegion.style.display = 'block';
        if (Object.keys(this.overlayDict).length == 0) overlayRegion.style.display = 'none';

        const rasterDiv = this.querySelector('#raster-checkboxes');
        rasterDiv.innerHTML = '';
        const overlayDiv = this.querySelector('#overlay-checkboxes');
        overlayDiv.innerHTML = '';

        [[rasterDiv, this.rasterDict], [overlayDiv, this.overlayDict]].map(([layerDiv, layerDict]) => {
            for (const [name, layer] of Object.entries(layerDict)) {
                let layerBox = this.buildLayerBox(name, layer);
                layerDiv.appendChild(layerBox);
            }
        });
    }

    /** Builds a radio box for each map base that can be chosen */
    buildMapCheckBox(name, layer) {
        let [div, input] = this.buildCheckBox(name);
        input.type = 'radio';
        input.name = 'base';
        input.checked = name == this.mapType;
        input.onclick = () => {
            if (input.checked) {
                layer.addTo(map);
                this.mapType = name; 
                layer.bringToFront();
            } else {
                layer.remove(map);
            }
        }
        return div;
    }

    /** Creates the checkbox for a layer. Displays name and when clicked adds layer to the map. base is
     * a boolean that indicates whether creating a checkbox for a map type or a layer.*/
    buildLayerBox(name, layer) {
        let [div, input] = this.buildCheckBox(name, layer);
        input.type = 'checkbox';
        input.name = 'layers';
        input.checked = name in current_display.getValue();
        if (name in current_display.getValue()) {
            this.handleOverlayadd(name, layer);
        }
        input.onclick = () => {
            if (input.checked) this.handleOverlayadd(name, layer);
            else {
                this.handleOverlayRemove(name, layer);
                delete current_display.getValue()[name];
            }
        }
        return div;
    }

    buildCheckBox(name) {
        var div = document.createElement('div');
        div.className = 'layer-checkbox';
        const input = document.createElement('input');
        input.id = name;
        var label = document.createElement('label');
        label.for = name;
        label.innerText = name;
        div.appendChild(input);
        div.appendChild(label);
        return [div, input];
    }

    /** Called when a layer is de-selected. */
    handleOverlayRemove(name, layer) {
        layer.remove(map);
        this.overlayOrder.splice(this.overlayOrder.indexOf(layer), 1)
        this.displayedColorbars = this.displayedColorbars.filter(colorbars => colorbars.name != name);
        const rasterColorbar = document.querySelector('#raster-colorbar');
        var img = null;
        if (this.displayedColorbars.length == 0) {
            rasterColorbar.src = '';
            rasterColorbar.style.display = 'none';
            this.displayedColorbar = null;
        } else {
            let mostRecentColorBar = this.displayedColorbars[this.displayedColorbars.length - 1];
            rasterColorbar.src = mostRecentColorBar.url;
            this.displayedColorbar = mostRecentColorBar.name;
            if (mostRecentColorBar.name in overlay_list) {
                img = this.overlayDict[mostRecentColorBar.name]._image;
            } else {
                img = this.rasterDict[mostRecentColorBar.name]._image;
            }
        }
        this.drawCanvas(img);
        this.updateMarkers();
    }
}

window.customElements.define('layer-controller', LayerController);