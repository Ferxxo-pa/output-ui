import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { configSchema, inputTypeSchema } from "@shared/schema";
import { addPerson, companyView, createCompany, getCompany, joinCompany, setPersonRate } from "./company";
import { earnEngine } from "./clock/engine";
import { startPersistence } from "./persist";

function ownerKeyFrom(req: Request): string | null {
  const value = req.header("x-owner-key");
  return value?.trim() ? value.trim() : null;
}

function personIdFrom(req: Request): string | null {
  const body = typeof req.body?.personId === "string" ? req.body.personId.trim() : "";
  const header = req.header("x-person-id")?.trim() ?? "";
  return body || header || null;
}

function peopleOnTheBusiness(): Array<{ id: string; name: string; hourlyCents: number }> {
  return getCompany().people.map((person) => ({
    id: person.id,
    name: person.name,
    hourlyCents: person.hourlyCents,
  }));
}

function requireOwner(req: Request) {
  const view = companyView(ownerKeyFrom(req));
  if (!view.owner) throw new Error("Only the owner can change that");
  return view;
}

export async function registerRoutes(app: Express): Promise<Server> {
  startPersistence();
  earnEngine.start();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/state", (req, res) => {
    res.json(earnEngine.getState(personIdFrom(req)));
  });

  app.post("/api/clock/in", async (req, res) => {
    try {
      const personId = personIdFrom(req);
      if (!personId) throw new Error("Choose who you are");
      const person = peopleOnTheBusiness().find((entry) => entry.id === personId);
      if (!person) throw new Error("That person is not on this business");
      if (!person.hourlyCents) throw new Error("Set an hourly rate for that person");
      res.json(
        await earnEngine.clockInPerson({
          id: person.id,
          name: person.name,
          hourlyCents: person.hourlyCents,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Clock-in failed";
      res.status(400).json({ message });
    }
  });

  app.post("/api/clock/out", async (req, res) => {
    try {
      const personId = personIdFrom(req);
      if (!personId) throw new Error("Choose who you are");
      res.json(await earnEngine.clockOutPerson(personId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Clock-out failed";
      res.status(400).json({ message });
    }
  });

  app.post("/api/input/:type", (req, res) => {
    const parsed = inputTypeSchema.safeParse(req.params.type);
    if (!parsed.success) {
      return res.status(400).json({ message: "Unknown input type" });
    }
    res.json(earnEngine.recordInput(parsed.data));
  });

  // Back-compat alias while UI migrates
  app.post("/api/actions/:type", (req, res) => {
    const parsed = inputTypeSchema.safeParse(req.params.type);
    if (!parsed.success) {
      return res.status(400).json({ message: "Unknown input type" });
    }
    res.json(earnEngine.recordInput(parsed.data));
  });

  app.patch("/api/config", (req, res) => {
    const parsed = configSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid config", issues: parsed.error.issues });
    }
    earnEngine.setConfig(parsed.data);
    res.json(earnEngine.getState());
  });

  app.post("/api/reset", (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }
    res.json(earnEngine.reset());
  });

  app.get("/api/company", (req, res) => {
    res.json(companyView(ownerKeyFrom(req)));
  });

  app.post("/api/company", (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      res.json(createCompany(name, ownerKeyFrom(req)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the company";
      res.status(400).json({ message });
    }
  });

  app.post("/api/company/join", (req, res) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      res.json(joinCompany(code, ownerKeyFrom(req)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not join that company";
      res.status(400).json({ message });
    }
  });

  app.get("/api/company/who", (_req, res) => {
    const people = peopleOnTheBusiness();
    res.json({
      people: people.map((person) => ({ id: person.id, name: person.name })),
    });
  });

  app.get("/api/company/roster", (req, res) => {
    try {
      requireOwner(req);
      res.json({ people: companyView(ownerKeyFrom(req)).people });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't load the company";
      res.status(message === "Only the owner can change that" ? 403 : 400).json({ message });
    }
  });

  app.post("/api/company/people", (req, res) => {
    try {
      requireOwner(req);
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const hourlyCents = Number(req.body?.hourlyCents);
      addPerson(name, hourlyCents);
      earnEngine.setConfig({ hourlyOutputCents: hourlyCents });
      res.json(companyView(ownerKeyFrom(req)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add that person";
      const status = message === "Only the owner can change that" ? 403 : 400;
      res.status(status).json({ message });
    }
  });

  app.patch("/api/company/people/:id", (req, res) => {
    try {
      requireOwner(req);
      const hourlyCents = Number(req.body?.hourlyCents);
      setPersonRate(req.params.id, hourlyCents);
      earnEngine.setConfig({ hourlyOutputCents: hourlyCents });
      res.json(companyView(ownerKeyFrom(req)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save that rate";
      const status = message === "Only the owner can change that" ? 403 : 400;
      res.status(status).json({ message });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  return createServer(app);
}
