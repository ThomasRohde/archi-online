export interface ScriptDefinition {
  id: string;
  name: string;
  code: string;
}

export const EXAMPLE_SCRIPT = `// jArchi-style scripting - Ctrl+Enter to run
console.log("Model:", model.name);
console.log("Elements:", $("element").size());
console.log("Relationships:", $("relationship").size());
console.log("Views:", $("view").size());

$("business-actor").each(function (actor) {
  console.log(" -", actor.name);
});
`;

export const JARCHI_CAPABILITY_TEST_SCRIPT = `// Elaborate jArchi-style capability test.
// Creates a small cross-layer model, decorates a view, checks selectors,
// relationship navigation, properties, visual objects, deletion, and undo grouping.
// Run on a scratch model if you do not want test objects added to your current model.

var runId = "JAS-" + Math.floor(Math.random() * 100000000);
var checks = 0;
var optionalSkips = 0;

function detailText(detail) {
  return detail === undefined || detail === "" ? "" : " - " + detail;
}

function pass(name, detail) {
  checks++;
  console.log("PASS: " + name + detailText(detail));
}

function assert(name, condition, detail) {
  if (!condition) {
    console.error("FAIL: " + name + detailText(detail));
    throw new Error("Assertion failed: " + name);
  }
  pass(name, detail);
}

function skip(name, detail) {
  optionalSkips++;
  console.warn("SKIP: " + name + detailText(detail));
}

function named(prefix) {
  return runId + " " + prefix;
}

function firstByName(type, name) {
  return $(type).filter(function (obj) {
    return obj.name === name;
  }).first();
}

function createOptionalRelationship(type, name, source, target) {
  try {
    return model.createRelationship(type, name, source, target);
  } catch (error) {
    skip("optional relationship " + type, error.message);
    return null;
  }
}

console.log("START: jArchi capability test " + runId);
assert("$.model points at model", $.model.name === model.name, model.name);

model.prop("script-test-run", runId);
model.prop("script-test-run", "duplicate-" + runId, true);
assert("model prop set/get", model.prop("script-test-run") === runId);
assert("model prop names", model.prop().indexOf("script-test-run") >= 0);
model.removeProp("script-test-run", "duplicate-" + runId);

var folders = $("folder");
assert("root folder selector", folders.size() >= 8, "folders=" + folders.size());
var businessFolder = folders.filter(".Business").first();
var appFolder = folders.filter(".Application").first();
var techFolder = folders.filter(".Technology & Physical").first();
var motivationFolder = folders.filter(".Motivation").first();
assert("named folder lookup", businessFolder && appFolder && techFolder && motivationFolder);

var actor = model.createElement("business-actor", named("Customer"), businessFolder);
var role = model.createElement("business-role", named("Accountable role"), businessFolder);
var process = model.createElement("business-process", named("Handle request"), businessFolder);
var object = model.createElement("business-object", named("Request dossier"), businessFolder);
var app = model.createElement("application-component", named("Case app"), appFolder);
var service = model.createElement("application-service", named("Case API"), appFolder);
var device = model.createElement("device", named("Edge device"), techFolder);
var driver = model.createElement("driver", named("Regulatory pressure"), motivationFolder);
var goal = model.createElement("goal", named("Traceable decisions"), motivationFolder);

assert("element creation count", $("element").filter(function (e) {
  return e.name.indexOf(runId) === 0;
}).size() === 9);
assert("parent folder navigation", $(actor).parent().first().name === "Business");

actor.documentation = "Created by the jArchi capability test.";
$(actor).add(role).prop("batch", runId);
actor.prop("email", runId + "@example.invalid");
actor.prop("email", "duplicate@example.invalid", true);
actor.removeProp("email", "duplicate@example.invalid");
assert("concept documentation", actor.documentation.indexOf("capability test") >= 0);
assert("concept properties", actor.prop("batch") === runId && actor.prop("email") === runId + "@example.invalid");

var assignment = model.createRelationship("assignment-relationship", named("assignment"), actor, role);
var realization = model.createRelationship("realization-relationship", named("realization"), app, service);
var serving = model.createRelationship("serving-relationship", named("serving"), service, process);
var access = createOptionalRelationship("access-relationship", named("access"), process, object);
var influence = createOptionalRelationship("influence-relationship", named("influence"), driver, goal);

if (access) {
  access.accessType = "readwrite";
  assert("access relationship attribute", access.accessType === "readwrite");
}
if (influence) {
  influence.influenceStrength = "++";
  assert("influence relationship attribute", influence.influenceStrength === "++");
}

assert("relationship selector", $("relationship").filter(function (r) {
  return r.name.indexOf(runId) === 0;
}).size() >= 3);
assert("relationship source/target", assignment.source.name === actor.name && assignment.target.name === role.name);
assert("in/out relationship navigation", $(service).inRels().size() >= 1 && $(service).outRels().size() >= 1);
assert("sourceEnds/targetEnds", $(serving).sourceEnds().first().name === service.name && $(serving).targetEnds().first().name === process.name);
assert("ends collection", $(serving).ends().filter("business-process").first().name === process.name);

var view = model.createArchimateView(named("Capability map"));
view.documentation = "A generated view that exercises the scripting API.";
view.prop("run", runId);
view.openInUI();
assert("view creation and props", view.prop("run") === runId && $("view").filter("." + view.name).size() === 1);

var group = view.createObject("group", 16, 16, 840, 150);
group.text = named("Execution group");
group.fillColor = "#f6f8fb";
group.lineColor = "#2a6cc4";
group.opacity = 230;
assert("group object style", group.text === named("Execution group") && group.opacity === 230);

var note = view.createObject("note", 24, 396, 650, 92);
note.text = "Generated by " + runId + ": selectors, properties, visuals, and relationship navigation all passed.";
note.fillColor = "#fff4cc";
note.fontColor = "#1e1e1e";
assert("note object text/style", note.text.indexOf(runId) >= 0 && note.fillColor === "#fff4cc");

var actorVisual = group.add(actor, 24, 56, 170, 70);
var roleVisual = group.add(role, 236, 56, 170, 70);
var appVisual = group.add(app, 448, 56, 170, 70);
var serviceVisual = group.add(service, 660, 56, 170, 70);
var processVisual = view.add(process, 252, 224, 190, 70);
var objectVisual = view.add(object, 492, 224, 190, 70);
var deviceVisual = view.add(device, 724, 224, 150, 70);
var driverVisual = view.add(driver, 24, 224, 170, 70);
var goalVisual = view.add(goal, 24, 310, 170, 70);

actorVisual.fillColor = "#dce9f9";
actorVisual.lineColor = "#2a6cc4";
actorVisual.fontColor = "#15395f";
actorVisual.bounds = { x: 32, width: 180 };
assert("visual bounds and colors", actorVisual.bounds.x === 32 && actorVisual.bounds.width === 180 && actorVisual.fillColor === "#dce9f9");
assert("visual concept/view links", actorVisual.concept.name === actor.name && actorVisual.view.name === view.name);
assert("visual parent chain", $(actorVisual).parent().first().id === group.id && $(actorVisual).parents().filter("view").size() === 1);

var assignmentConn = view.add(assignment, actorVisual, roleVisual);
var realizationConn = view.add(realization, appVisual, serviceVisual);
var servingConn = view.add(serving, serviceVisual, processVisual);
assignmentConn.lineColor = "#5b6f8f";
realizationConn.lineColor = "#5b6f8f";
servingConn.lineColor = "#5b6f8f";
assert("connection concept/source/target", assignmentConn.concept.name === assignment.name && assignmentConn.source.id === actorVisual.id && assignmentConn.target.id === roleVisual.id);
assert("connection style", assignmentConn.lineColor === "#5b6f8f");

if (access) {
  var accessConn = view.add(access, processVisual, objectVisual);
  accessConn.lineColor = "#7a5c00";
  assert("optional access connection", accessConn.concept.accessType === "readwrite");
}
if (influence) {
  var influenceConn = view.add(influence, driverVisual, goalVisual);
  influenceConn.lineColor = "#7a3f8f";
  assert("optional influence connection", influenceConn.concept.influenceStrength === "++");
}

var testElements = $("element").filter(function (e) {
  return e.name.indexOf(runId) === 0;
});
assert("collection size/length", testElements.size() === testElements.length);
assert("collection get/first/last", testElements.get(0).id === testElements.first().id && testElements.last().name.indexOf(runId) === 0);
assert("collection toArray/map/each", testElements.toArray().length === testElements.map(function (e) {
  return e.name;
}).length);

var iterated = 0;
testElements.each(function () {
  iterated++;
});
assert("collection each", iterated === testElements.size());
assert("collection filter/not/is/add", testElements.filter("business-actor").size() === 1 && testElements.not("business-actor").size() === testElements.size() - 1 && testElements.is("element") && testElements.add(assignment).size() === testElements.size() + 1);
assert("name selectors", $("." + actor.name).first().id === actor.id && $("business-actor." + actor.name).first().id === actor.id && $("#" + actor.id).first().id === actor.id);
assert("objectRefs/viewRefs", $(actor).objectRefs().size() >= 1 && $(actor).viewRefs().first().id === view.id);
assert("view children/find", $(view).children().size() >= 5 && $(view).find("business-actor").first().id === actorVisual.id);
assert("folder find", $(businessFolder).find("business-actor").filter(function (e) {
  return e.name === actor.name;
}).size() === 1);

var attrOriginal = actor.documentation;
$(actor).attr("documentation", attrOriginal + " Updated via attr.");
assert("collection attr setter/getter", $(actor).attr("documentation").indexOf("Updated via attr") >= 0);

var temp = model.createElement("goal", named("temporary delete target"), motivationFolder);
var tempName = temp.name;
assert("temporary element exists", $("." + temp.name).size() === 1);
$(temp).delete();
assert("collection delete", $("." + tempName).isEmpty());

var scratchNote = view.createObject("note", 704, 396, 172, 92);
scratchNote.text = named("scratch note");
assert("temporary visual exists", $(view).children().filter(function (o) {
  return o.name === scratchNote.name;
}).size() === 1);
$(scratchNote).delete();
assert("visual delete", $(view).children().filter(function (o) {
  return o.name === named("scratch note");
}).isEmpty());

console.log("RESULT: PASS " + checks + " checks, " + optionalSkips + " optional skips, run " + runId);
`;

export const BUILT_IN_SCRIPTS: ScriptDefinition[] = [
  { id: 'builtin-example', name: 'example', code: EXAMPLE_SCRIPT },
  {
    id: 'builtin-jarchi-capability-test',
    name: 'jArchi capability test',
    code: JARCHI_CAPABILITY_TEST_SCRIPT,
  },
];
