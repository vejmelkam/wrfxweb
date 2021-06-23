import { Slider } from './slider.js';
import { simVars } from '../util.js';
import { controllers } from './Controller.js';

export class SimulationSlider extends Slider {
    constructor() {
        super(340, simVars.sortedTimestamps.length - 1);
    }

    connectedCallback() {
        super.connectedCallback();

        controllers.currentDomain.subscribe(() => {
            this.nFrames = simVars.sortedTimestamps.length - 1;
        })

        const sliderBar = this.shadowRoot.querySelector('#slider-bar');
        sliderBar.style.background = '#d6d6d6';

        const style = this.shadowRoot.querySelector('style');
        style.innerText += `
            #slider-progress {
                position:absolute;
                display: none;
                margin: auto 0;
                top: 0; bottom: 0; left: 0; right: 0;
                width: 1%;
                height: 11px;
                background: #f8f8f8;
                border-style: solid;
                border-radius: 4px;
                border-width: .5px;
                border-color: #cccccc;
                pointer-events: none;
            }
            #slider-marker-info {
                position: absolute;
                margin: auto auto;
                top: 30px; bottom: 0; left: 0; right: 0;
                background: white;
                width: 160px;
                height: 20px;
                border-radius: .4rem;
                display: none;
                font-weight: bold;
                font-size: 1rem; 
                padding: 5px 5px 8px 10px;
            }
            .slider-marker {
                position: absolute;
                margin: auto 0;
                top: 0; bottom: 0; left: 0; right: 0;
                background: #5d5d5d;
                width: 4px;
                height: 11px;
                border-radius: 4px;
            }
            #slider-end {
                left: 340px;
            }
        `;

        const createElement = (id=null, className=null) => {
            const div = document.createElement('div');
            if (id) {
                div.id = id;
            }
            if (className) {
                div.className = className;
            }
            return div;
        }

        const slider = this.shadowRoot.querySelector('#slider');
        const sliderHead = this.shadowRoot.querySelector('#slider-head');
        const sliderStart = createElement('slider-start', 'slider-marker');
        const sliderEnd = createElement('slider-end', 'slider-marker');
        const sliderProgress = createElement('slider-progress');

        slider.append(sliderStart, sliderEnd, sliderProgress);

        sliderHead.onpointerdown = (e) => {
            const updateCallback = (newFrame) => {
                this.setTimestamp(newFrame);
            }

            this.dragSliderHead(e, updateCallback);
        }

        controllers.currentTimestamp.subscribe(() => {
            var currentTimestamp = controllers.currentTimestamp.getValue();
            var newFrame = simVars.sortedTimestamps.indexOf(currentTimestamp);

            this.updateHeadPosition(newFrame);
        })

    }

    setTimestamp(timeIndex) {
        var newTimestamp = simVars.sortedTimestamps[timeIndex];
        var endDate = controllers.endDate.getValue();
        var startDate = controllers.startDate.getValue();

        if (newTimestamp > endDate) {
            newTimestamp = endDate;
        } else if (newTimestamp < startDate) {
            newTimestamp = startDate;
        }

        controllers.currentTimestamp.setValue(newTimestamp);
    }
}

window.customElements.define('simulation-slider', SimulationSlider);