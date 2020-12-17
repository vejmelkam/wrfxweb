/**
 * Component that handles adding and removing layers to the map. Provides user with a window
 * to choose different layers available to add. 
 */
class LayerController extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `
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
    }

    /** Disable map events from within the layer selection window to prevent unwanted zooming
     * and panning. */
    connectedCallback() {
        const layerController = this.querySelector('#layer-controller-container');
        dragElement(layerController, '');
        L.DomEvent.disableClickPropagation(layerController);
        L.DomEvent.disableScrollPropagation(layerController);

        domainInstance.subscribe(() => this.resetLayers());
        currentDomain.subscribe(() => this.buildLayerBoxes());
    }

    /** Adds checkboxes for the different available map types. Should only be called once after
     * the map has been initialized. */
    buildMapBase() {
        const baseMapDiv = this.querySelector('#map-checkboxes');
        Object.entries(base_layer_dict).map(entry => {
            let name = entry[0];
            let layer = entry[1]
            let mapCheckBox = this.buildMapCheckBox(name, layer);
            baseMapDiv.appendChild(mapCheckBox);
        });
    }

    /** Called when new simulations are selected. Avoids the problem that layers that exist for one
     * simulation are selected for a simulation that doesn't have those same layers.*/
    resetLayers() {
        Object.entries(current_display).map(entry => {
            let name = entry[0];
            let layer = entry[1];
            this.handleOverlayRemove(name, layer);
        });
        current_display = {};
        this.querySelector('#layer-controller-container').style.display = 'block';
        this.buildLayerBoxes();
    }

    /** Builds a checkbox for each raster layer and overlay layer */
    buildLayerBoxes() {
        // zoom into raster region
        const rasterDiv = this.querySelector('#raster-checkboxes');
        rasterDiv.innerHTML = '';
        const overlayDiv = this.querySelector('#overlay-checkboxes');
        overlayDiv.innerHTML = '';
        [[rasterDiv, raster_dict], [overlayDiv, overlay_dict]].map(layerArray => {
            let layerDiv = layerArray[0];
            let layerDict = layerArray[1];
            Object.entries(layerDict).map(entry => {
                let name = entry[0];
                let layer = entry[1];
                let layerBox = this.buildLayerBox(name, layer);
                layerDiv.appendChild(layerBox);
            });
        });
    }

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
        input.checked = name in current_display;
        if (name in current_display) {
            this.handleOverlayadd(name, layer);
        }
        input.id = name;
        input.onclick = () => {
            if (input.checked) this.handleOverlayadd(name, layer);
            else this.handleOverlayRemove(name, layer);
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

    /** Called when a layer is selected. */
    handleOverlayadd(name, layer) {
        // register in currently displayed layers and bring to front if it's an overlay
        console.log('name ' + name + ' layer ' + layer);
        layer.addTo(map);
        current_display[name] = layer;
        if(overlay_list.indexOf(name) >= 0) {
            layer.bringToFront();
        } else {
            layer.bringToBack();
        }

        // if the overlay being added now has a colorbar and there is none displayed, show it
        var rasters_now = rasters[currentDomain.getValue()][current_timestamp];
        if('colorbar' in rasters_now[name]) {
            var cb_url = raster_base + rasters_now[name].colorbar;
            const rasterColorbar = document.querySelector('#raster-colorbar');
            rasterColorbar.src = cb_url;
            rasterColorbar.style.display = 'block';
            displayed_colorbar = name;
            displayed_colorbars.push({name: name, url: cb_url});
        }
        // this should probably be removed at some point
        const simulationController = document.querySelector('simulation-controller');
        simulationController.updateSlider();
    }

    /** Called when a layer is de-selected. */
    handleOverlayRemove(name, layer) {
        layer.remove(map);
        delete current_display[name];

        displayed_colorbars = displayed_colorbars.filter(colorbars => colorbars.name != name);
        const rasterColorbar = document.querySelector('#raster-colorbar');
        if (displayed_colorbars.length == 0) {
            rasterColorbar.src = '';
            rasterColorbar.style.display = 'none';
            displayed_colorbar = null;
        } else {
            let mostRecentColorBar = displayed_colorbars[displayed_colorbars.length - 1];
            rasterColorbar.src = mostRecentColorBar.url;
            displayed_colorbar = mostRecentColorBar.name;
        }
    }
}

window.customElements.define('layer-controller', LayerController);