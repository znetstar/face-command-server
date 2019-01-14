const { assert } = require("chai");
const { StatusType, DetectionOptions } = require("face-command-common");
const _ = require("lodash");
const random = require("./random");

describe("DetectionService", function () {
    describe("#constructor()", function () {
        it("should create sucessfully", async function () {
            await random.detectionSvc();
        });
    });

    describe("#IsDetectionRunning()", function () {
        it("should return true if detectionTimeout is set", async function () {
            const dtSvc = await random.detectionSvc();

            dtSvc.detectionInterval = random.chance.integer();
            assert.isTrue(await dtSvc.IsDetectionRunning());
        });
    });

    describe("#GetLastStatus()", function () {
        it("should return last status", async function () {
            const dtSvc = await random.detectionSvc();

            const lastStatus = random.common.status();

            dtSvc.lastStatus = lastStatus;

            assert.deepEqual(lastStatus, (await dtSvc.GetLastStatus()));
        });
    });

    describe("#AddStatus()", function () {
        it("should add new status to the database", async function () {
            this.timeout(10000);
            const res = await random.appResources();
            const fSvc = await random.facesSvc(res);
            const dtSvc = await random.detectionSvc(res);

            const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const stInfo = random.common.status();
            stInfo.statusType = +StatusType.FacesRecognized;
            stInfo.recognizedFaces = [ face ];
            
            const status = await dtSvc.AddStatus(stInfo.statusType, stInfo.time, stInfo.brightness, stInfo.recognizedFaces);
            stInfo.id = status.id;

            assert.deepEqual(stInfo, status);
        });
    });

    describe("#GetStatus()", function () {
        it("should retrieve a status by ID", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const fSvc = await random.facesSvc(res, cap);
            const dtSvc = await random.detectionSvc(res, cap);

            const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const status = await dtSvc.AddStatus(+StatusType.FacesRecognized, random.chance.date(), random.chance.floating({ min: 0, max: 1 }), [ face ]);

            const resStatus = await dtSvc.GetStatus(status.id);

            assert.deepEqual(status, resStatus);
        });
    });

    describe("#StatusHistory()", function () {
        this.timeout(5000*5000);
        it("should retrieve all statuses in decending order", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const fSvc = await random.facesSvc(res, cap);
            const dtSvc = await random.detectionSvc(res, cap);

            const statuses = [];

            for (let year = 0; year < 25; year++) {
                const type = random.common.statusType();
                let status;
                if (type === +StatusType.FacesRecognized || type === +StatusType.FacesNoLongerRecognized) { 
                    const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
                    status = await dtSvc.AddStatus(type, random.chance.date({ year: year+1900 }), random.chance.floating({ min: 0, max: 1 }), [ face ]);
                } else {
                    status = await dtSvc.AddStatus(type, random.chance.date({ year: year+1900 }), random.chance.floating({ min: 0, max: 1 }), []);
                }
                statuses.push(status);
            }

            const sortedStatuses = statuses.sort((a,b) => b.time - a.time);
            
            const resultStatuses = await dtSvc.StatusHistory();
            assert.deepEqual(sortedStatuses, resultStatuses);
        });

        it("should retrieve all within a given range", async function () {
            const res = await random.appResources();
            const cap = await random.capture(res);
            const fSvc = await random.facesSvc(res, cap);
            const dtSvc = await random.detectionSvc(res, cap);

            const statuses = [];

            for (let year = 0; year < 100; year++) {
                const type = random.common.statusType();
                let status;
                if (type === +StatusType.FacesRecognized || type === +StatusType.FacesNoLongerRecognized) { 
                    const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
                    status = await dtSvc.AddStatus(type, random.chance.date({ year: year+1900 }), random.chance.floating({ min: 0, max: 1 }), [ face ]);
                } else {
                    status = await dtSvc.AddStatus(type, random.chance.date({ year: year+1900 }), random.chance.floating({ min: 0, max: 1 }), []);
                }
                statuses.push(status);
            }

            const start = new Date("1/11/1918");
            const end = new Date("9/1/1939");

            const sortedStatuses = statuses.filter((s) =>  (s.time >= start) && (s.time <= end) ).sort((a,b) => b.time - a.time);
            
            const resultStatuses = await dtSvc.StatusHistory(start, end);
            assert.deepEqual(sortedStatuses, resultStatuses);
        });
    });

    describe("#DetectChanges()", function () {
        it("should emit status BrightnessTooLow if image brightness below the set threshold", function (done) {
            this.timeout(5000);
            (async () => {
                try {
                    const res = await random.appResources();
                    res.nconf.set("minimumBrightness", random.defaultConfig.minimumBrightness);
                    
                    const cap = await random.capture(res, (await random.images.files["sampleDark.png"]()));

                    const dtSvc = await random.detectionSvc(res, cap);
                    
                    dtSvc.once("StatusChange", (status) => {
                        assert.equal(+StatusType.BrightnessTooLow, status.statusType);
                        done();
                    });

                    const dtOptions = new DetectionOptions(random.chance.floating(), random.recOptions(), []);

                    await dtSvc.DetectChanges(dtOptions);
                } catch (e) { done(e); }
            })();
        });

        it("the brightness alert property should be set to true if the captured image is too dark more than once", async function () {
            const res = await random.appResources();
            res.nconf.set("minimumBrightness", random.defaultConfig.minimumBrightness);
            
            const cap = await random.capture(res, (await random.images.files["sampleDark.png"]()));

            const dtSvc = await random.detectionSvc(res, cap);
    
            const dtOptions = new DetectionOptions(random.chance.floating(), random.recOptions(), []);

            await dtSvc.DetectChanges(dtOptions);
            await dtSvc.DetectChanges(dtOptions);
            assert.isTrue(dtOptions.state.brightnessAlert);
        });

        it("the same recognizer should be used provided the faces specified in the options are the same", async function () {
            this.timeout(10000);
            const res = await random.appResources();
            const cap = await random.capture(res);
            const dtSvc = await random.detectionSvc(res, cap);
            const fSvc = await random.facesSvc(res, cap);

            const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
            const dtOptions = new DetectionOptions(random.chance.floating(), random.recOptions(), [ face ]);
            
            await dtSvc.DetectChanges(dtOptions);

            assert.isObject(dtOptions.state);
            assert.isOk(dtOptions.state.recognizer);

            const recognizer = dtOptions.state.recognizer;

            await dtSvc.DetectChanges(dtOptions);

            assert.strictEqual(recognizer, dtOptions.state.recognizer);
        });

        it("should emit FacesDetected if faces are detected but none are recognized", function (done) {
            this.timeout(5000);
            (async() => {
                try {
                    const res = await random.appResources();
                    const cap = await random.capture(res);
                    const dtSvc = await random.detectionSvc(res, cap);
                
                    const dtOptions = new DetectionOptions(random.chance.floating(), random.recOptions(), [ ]);
                    
                    dtSvc.on("StatusChange", (status) => {
                        assert.equal(+StatusType.FacesDetected, status.statusType);
                        done();
                    });

                    await dtSvc.DetectChanges(dtOptions);
                } catch (e) { done(e); }
            })();
        });

        it("should emit FacesRecognized if faces are recognized", function (done) {
            this.timeout(5000);
            (async() => {
                try {
                    const res = await random.appResources();
                    const cap = await random.capture(res);
                    const fSvc = await random.facesSvc(res, cap);
                    const dtSvc = await random.detectionSvc(res, cap);
                
                    const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), false);
                    const dtOptions = new DetectionOptions(random.chance.floating(), random.recOptions(), [ face ]);
                    
                    dtSvc.on("StatusChange", (status) => {
                        assert.equal(+StatusType.FacesRecognized, status.statusType);
                        done();
                    });

                    await dtSvc.DetectChanges(dtOptions);
                } catch (e) {
                    done(e);
                }
            })();
        });

        it("should emit FacesNoLongerDetected if faces were previously detected but are no longer detected", function (done) {
            this.timeout(10000);
            (async() => {
                try {
                    const res = await random.appResources();
                    const cap = await random.capture(res);
                    const dtSvc = await random.detectionSvc(res, cap);
            
                    const dtOptions = new DetectionOptions(random.chance.floating(), random.recOptions(), [ ]);
                
                    function secondSC (status) {
                        assert.equal(+StatusType.FacesNoLongerDetected, status.statusType);
                        done();
                    }
                    
                    async function firstSC (status) {
                        try {
                            assert.equal(+StatusType.FacesDetected, status.statusType);
                            dtSvc.once("StatusChange", secondSC);
                            dtSvc.capture = await random.capture(res, ( await random.images.files["sampleNoFaces.jpg"]() ));
                            await dtSvc.DetectChanges(dtOptions);
                        } catch (e) {
                            done(e);
                        }
                    }

                    dtSvc.once("StatusChange", firstSC);
                    await dtSvc.DetectChanges(dtOptions);
                } catch (e) { done(e); }
            })();
        });
    });

    describe("#StopDetection()", function () {
        it("should prevent DetectChanges from running by clearing running clearInterval", async function () {
            const dtSvc = await random.detectionSvc();
            dtSvc.detectionInterval = random.chance.floating();
            dtSvc.StopDetection();
            assert.isNull(dtSvc.detectionInterval);
        });

        it("should emit ⚡DetectionRunning", function (done) {
            this.timeout(10000);
            (async () => {
                try {
                    const dtSvc = await random.detectionSvc();
                    dtSvc.detectionInterval = random.chance.floating();
                    dtSvc.once("DetectionRunning", (update) => {
                        assert.isFalse(update);
                        done();
                    });
                    dtSvc.StopDetection();
                } catch (e) {
                    done(e);
                }
            })();
        });
    });

    describe("#RPC_StartDetection()", function () {
        it("should begin the detection cycle with the provided options", function (done) {
            this.timeout(5000);
            (async () => { 
                try {
                    const res = await random.appResources();
                    const cap = await random.capture();
                    const fSvc = await random.facesSvc(res, cap)
                    const dtSvc = await random.detectionSvc(res, cap);
                    const opts = random.common.detectionOptions();
                    opts.frequency = 500;

                    const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
                    const faces = [face];
                    opts.faces = faces;

                    let cycles = 0;

                    dtSvc.DetectChanges = (options) => {
                        assert.deepEqual(opts, options);
                        cycles++;
                        if (cycles > 1)
                            clearInterval(dtSvc.detectionInterval);
                    };

                    setTimeout(() => {
                        assert.equal(2, cycles);
                        done();
                    }, 2500);

                    const rpcOpts = _.cloneDeep(opts);
                    rpcOpts.faces = rpcOpts.faces.map((f) => f.id);
                    await dtSvc.RPC_StartDetection(rpcOpts);
                } catch (e) {
                    done(e);
                }
            })();
        });

        it("should emit ⚡DetectionRunning", function (done) {
            this.timeout(5000);
            (async () => { 
                try {
                    const res = await random.appResources();
                    const dtSvc = await random.detectionSvc(res);
                    const opts = random.common.detectionOptions();
                    opts.frequency = 100;
                    opts.faces = [];
   
                    dtSvc.once("DetectionRunning", function (running) {
                        assert.isTrue(running);
                        done();
                    });

                    await dtSvc.RPC_StartDetection(opts);
                } catch (e) {
                    done(e);
                }
            })();
        });
    });

    describe("#StartDetection()", function () {
        it("should begin the detection cycle with the provided options", function (done) {
            this.timeout(10000);
            (async () => { 
                try {
                    const res = await random.appResources();
                    const cap = await random.capture();
                    const fSvc = await random.facesSvc(res, cap)
                    const dtSvc = await random.detectionSvc(res, cap);
                    const opts = random.common.detectionOptions();
                    opts.frequency = 500;

                    const face = await fSvc.AddFace((await random.sampleImage()), random.chance.string(), random.chance.bool(), true);
                    const faces = [ face ];
                    opts.faces = faces;

                    let cycles = 0;

                    dtSvc.DetectChanges = (options) => {
                        assert.deepEqual(opts, options);
                        if (cycles > 1) {
                            clearInterval(dtSvc.detectionInterval);
                        } else {
                            cycles++;
                        }
                    };

                    setTimeout(() => {
                        assert.equal(2, cycles);
                        done();
                    }, 2001);

                    await dtSvc.StartDetection(opts);
                } catch (e) {
                    done(e);
                }
            })();
        });

        it("should emit ⚡DetectionRunning", function (done) {
            this.timeout(10000);
            (async () => { 
                try {
                    const res = await random.appResources();
                    const dtSvc = await random.detectionSvc(res);
                    const opts = random.common.detectionOptions();
                    opts.autostartFaces = false;
                    opts.frequency = 1000;
                    opts.faces = [];
   
                    dtSvc.once("DetectionRunning", function (running) {
                        assert.isTrue(running);
                        done();
                    });

                    await dtSvc.StartDetection(opts);
                } catch (e) {
                    done(e);
                }
            })();
        });
    });
});