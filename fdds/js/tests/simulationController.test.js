const {SimulationController} = require("../components/simulationController");

global.L = {DomEvent: {disableClickPropagation: jest.fn(), disableScrollPropagation: jest.fn()}};

const controllers = require("../components/Controller.js");
jest.mock('../components/Controller.js', () => ({
    currentDomain: ({
        getValue: () => 1,
        subscribe: () => {}
    }),
    sorted_timestamps: ({
        getValue: () => ["2020", "2021"]
    }),
    current_timestamp: ({
        getValue: () => "2020",
        setValue: jest.fn()
    }),
    current_display: ({
        getValue: () => ({"layer": {}}),
        setValue: jest.fn()
    }),
    currentSimulation: ({
        getValue: () => "currentSimulation"
    }),
    rasters: ({
        getValue: () => ({
            1: {
                "2020": {"layer": {raster: "raster test 1: 2020", coords: {0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1]}, "colorbar": "colorbar 1: 2020"}},
                "2021": {"layer": {raster: "raster test 1: 2021", coords: {0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1]}, "colorbar": "colorbar 1: 2021"}}
            },
            2: {
                "2020": {"layer": {raster: "raster test 2: 2020", coords: {0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1]}, "colorbar": "colorbar 2: 2020"}},
                "2020.5": {"layer": {raster: "raster test 2: 2020.5", coords: {0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1]}, "colorbar": "colorbar 2: 2020.5"}},
                "2021": {"layer": {raster: "raster test 2: 2021", coords: {0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1]}, "colorbar": "colorbar 2: 2021"}}
            }
        })
    }),
    raster_base: ({
        getValue: () => "test_base/"
    }),
    organization: ({
        getValue: () => "SJSU"
    })
}));

describe('Setting up tests for Simulation Controller', () => {
    var simulationController;

    beforeEach(async () => {
        simulationController = await document.body.appendChild(new SimulationController());
    });

    test('Images and their colorbars should preload', () => {
       simulationController.preloadVariables(0, 2);
       expect("layer" in simulationController.preloaded).toEqual(true);
       expect("layer_cb" in simulationController.preloaded).toEqual(true);
       expect(Object.keys(simulationController.preloaded["layer"]).length).toEqual(2);
       expect(Object.keys(simulationController.preloaded["layer_cb"]).length).toEqual(2);
    });
});