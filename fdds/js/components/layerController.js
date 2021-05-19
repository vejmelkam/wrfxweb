import {map, baseLayerDict, dragElement, overlay_list, debounce} from '../util.js';
import {displayedColorbar, currentDomain, overlayOrder, current_timestamp, currentSimulation, rasters, raster_base, sorted_timestamps, organization} from './Controller.js';

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
        this.preloaded = {};
        this.worker; 
    }

    /** Disable map events from within the layer selection window to prevent unwanted zooming
     * and panning. Set up callbacks to trigger when currentdomain updates and current_timestamp
     * updates. */
    connectedCallback() {
        const layerController = this.querySelector('#layer-controller-container');
        dragElement(layerController, '');
        L.DomEvent.disableClickPropagation(layerController);
        L.DomEvent.disableScrollPropagation(layerController);
        const domainSubscription = () => {
            this.domainSwitch();
        }
        currentDomain.subscribe(domainSubscription);
        current_timestamp.subscribe(debounce(() => this.updateTime(), 100));
        this.buildMapBase();
    }

    /** Triggered whenever current_timestamp is changed. For every layer currently selected 
     * need to set its image url to the point to the image associated with the current time.
     * Need to update the colorbar on top to the current time as well.
     */
    updateTime() {
        if (this.currentSimulation != currentSimulation.getValue()) {
            return;
        }
        var rastersNow = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var reloading = false;
        for (var layerName of overlayOrder) {
            var layer = this.getLayer(layerName);
            var rasterInfo = rastersNow[layerName];
            var cs = rasterInfo.coords;
            var imageURL = raster_base.getValue() + rasterInfo.raster;
            if (!(imageURL in this.preloaded)) {
                if (!reloading) {
                    var startTime = current_timestamp.getValue();
                    var endTime = sorted_timestamps.getValue()[sorted_timestamps.getValue().length - 1];
                    this.loadWithPriority(startTime, endTime, overlayOrder);
                }
                reloading = true;
            } else {
                imageURL = this.preloaded[imageURL];
            }
            layer.setUrl(imageURL,
                        [ [cs[0][1], cs[0][0]], [cs[2][1], cs[2][0]] ],
                        { attribution: organization.getValue(), opacity: 0.5 });
            if (layerName == displayedColorbar.getValue()) {
                const rasterColorbar = document.querySelector('#raster-colorbar');
                var colorbarURL = raster_base.getValue() + rasterInfo.colorbar;
                if (colorbarURL in this.preloaded) {
                    colorbarURL = this.preloaded[colorbarURL];
                }
                rasterColorbar.src = colorbarURL;
            }
        }
    }

    loadWithPriority(startTime, endTime, layerNames) {
        var worker = this.createWorker();
        var loadLater = [];
        function nowOrLater(timeStamp, imageURL) {
            if (timeStamp < startTime || timeStamp > endTime) {
                loadLater.push(imageURL);
            }    
            else {
                worker.postMessage(imageURL);
            }
        }
        for (var timeStamp of sorted_timestamps.getValue()) {
            var raster = rasters.getValue()[currentDomain.getValue()][timeStamp];
            for (var layerName of layerNames) {
                var rasterInfo = raster[layerName];
                var imageURL = raster_base.getValue() + rasterInfo.raster;
                if (!(imageURL in this.preloaded)) {
                    nowOrLater(timeStamp, imageURL);
                    if ('colorbar' in rasterInfo) {
                        var colorbarURL = raster_base.getValue() + rasterInfo.colorbar;
                        nowOrLater(timeStamp, colorbarURL);
                    }
                }
            }
        }
        for (var imageURL of loadLater) {
            worker.postMessage(imageURL);
        }
    }

    /** Called when a new domain is selected or a new simulation is selected. */
    domainSwitch() {
        // remove all layers of previous domain and reset the colorbar
        if (this.worker) {
            this.worker.terminate();
        }
        for (var layerName of overlayOrder) {
            this.getLayer(layerName).remove(map);
        }
        displayedColorbar.setValue(null);
        const rasterColorbar = document.querySelector('#raster-colorbar');
        rasterColorbar.src = "";
        rasterColorbar.style.display = "none";
        // if on a new simulation entirely, reset selected layers
        if (this.currentSimulation != currentSimulation.getValue()) {
            overlayOrder.length = 0;
            this.currentSimulation = currentSimulation.getValue();
            this.querySelector('#layer-controller-container').style.display = 'block';
            for (var imgURL in this.preloaded) {
                URL.revokeObjectURL(this.preloaded[imgURL]);
            }
            this.preloaded = {};
        }
        // build the layer groups of the current domain
        var first_rasters = rasters.getValue()[currentDomain.getValue()][sorted_timestamps.getValue()[0]];
        var vars = Object.keys(first_rasters);
        var cs = first_rasters[vars[0]].coords;
        map.fitBounds([ [cs[0][1], cs[0][0]], [cs[2][1], cs[2][0]] ]);
        this.rasterDict = {};
        this.overlayDict = {};    
        for (var r in first_rasters) {
            var raster_info = first_rasters[r];
            var cs = raster_info.coords;
            var layer = L.imageOverlay(raster_base.getValue() + raster_info.raster,
                                        [[cs[0][1], cs[0][0]], [cs[2][1], cs[2][0]]],
                                        {
                                            attribution: organization.getValue(),
                                            opacity: 0.5,
                                            interactive: true
                                        });
            if(overlay_list.indexOf(r) >= 0) {
                this.overlayDict[r] = layer;
            } else {
                this.rasterDict[r] = layer;
            }
        };
        this.buildLayerBoxes();
    }

    /** Called when a layer is selected. */
    handleOverlayadd(name) {
        // register in currently displayed layers and bring to front if it's an overlay
        var layer = this.getLayer(name);
        console.log('name ' + name + ' layer ' + layer);
        layer.addTo(map);
        if (!(overlayOrder.includes(name))) {
            overlayOrder.push(name);
        }
        if (overlay_list.indexOf(name) >= 0) {
            layer.bringToFront();
        } else {
            layer.bringToBack();
        }
        // if the overlay being added now has a colorbar and there is none displayed, show it
        var rasters_now = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var raster_info = rasters_now[name];
        var cs = raster_info.coords;
        layer.setUrl(raster_base.getValue() + raster_info.raster,
                    [ [cs[0][1], cs[0][0]], [cs[2][1], cs[2][0]] ],
                    { attribution: organization.getValue(), opacity: 0.5 });
        if('colorbar' in raster_info) {
            var cb_url = raster_base.getValue() + raster_info.colorbar;
            const rasterColorbar = document.querySelector('#raster-colorbar');
            rasterColorbar.src = cb_url;
            rasterColorbar.style.display = 'block';
            displayedColorbar.setValue(name);
        }
        var startDate = current_timestamp.getValue();
        var endDate = sorted_timestamps.getValue()[sorted_timestamps.getValue().length - 1];
        this.loadWithPriority(startDate, endDate, overlayOrder);
    }

    createWorker() {
        if (this.worker) {
            this.worker.terminate();
        }
        var worker = new Worker('imageLoadingWorker.js');
        this.worker = worker;
        worker.addEventListener('message', event => {
            const imageData = event.data;
            const imageURL = imageData.imageURL;
            const objectURL = URL.createObjectURL(imageData.blob);
            const img = new Image();
            img.onload = () => {
                this.preloaded[imageURL] = objectURL;
            }
            img.src = objectURL;
        });
        return worker;
    }

    /** Called when a layer is de-selected. */
    handleOverlayRemove(name) {
        this.getLayer(name).remove(map);
        overlayOrder.splice(overlayOrder.indexOf(name), 1);
        const rasterColorbar = document.querySelector('#raster-colorbar');
        var rasters_now = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var mostRecentColorbar = null;
        var colorbarSrc = '';
        var colorbarDisplay = 'none';
        for (var i = overlayOrder.length - 1; i >= 0; i--) {
            if ('colorbar' in rasters_now[overlayOrder[i]]) {
                mostRecentColorbar = overlayOrder[i];
                colorbarSrc = raster_base.getValue() + rasters_now[overlayOrder[i]].colorbar;
                colorbarDisplay = 'block';
                break;
            }
        }
        displayedColorbar.setValue(mostRecentColorbar);
        rasterColorbar.src = colorbarSrc;
        rasterColorbar.style.display = colorbarDisplay;
        var startDate = current_timestamp.getValue();
        var endDate = sorted_timestamps.getValue()[sorted_timestamps.getValue().length - 1];
        this.loadWithPriority(startDate, endDate, overlayOrder);
    }

    /** Returns the layer associated with a given name */
    getLayer(name) {
        if (overlay_list.includes(name)) {
            return this.overlayDict[name];
        }
        return this.rasterDict[name];
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
        if (Object.keys(this.rasterDict).length == 0) {
            rasterRegion.style.display = 'none';
        }
        const overlayRegion = this.querySelector('#overlay-layers');
        overlayRegion.style.display = 'block';
        if (Object.keys(this.overlayDict).length == 0) {
            overlayRegion.style.display = 'none';
        }

        const rasterDiv = this.querySelector('#raster-checkboxes');
        rasterDiv.innerHTML = '';
        const overlayDiv = this.querySelector('#overlay-checkboxes');
        overlayDiv.innerHTML = '';

        for (const [layerDiv, layerDict] of [[rasterDiv, this.rasterDict], [overlayDiv, this.overlayDict]]) {
            for (var layerName in layerDict) {
                layerDiv.appendChild(this.buildLayerBox(layerName));
            }
        }
        for (var layerName of overlayOrder) {
            this.handleOverlayadd(layerName);
        }
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
    buildLayerBox(name) {
        let [div, input] = this.buildCheckBox(name);
        input.type = 'checkbox';
        input.name = 'layers';
        input.checked = overlayOrder.includes(name);
        input.onclick = () => {
            if (input.checked) {
                this.handleOverlayadd(name);
            } else {
                this.handleOverlayRemove(name);
            }
        }
        return div;
    }

    /** Creates the htmlElement for each checkbox in the LayerController. */
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
}

window.customElements.define('layer-controller', LayerController);