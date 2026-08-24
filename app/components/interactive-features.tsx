"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "patient" | "doctor" | "admin";
type Doctor = { name: string; specialty: string; initials: string; color: string; rating: string; next: string; fee: string; experience: string; visits: string };
type Patient = { name: string; concern: string; urgency: string; time: string; age: string };
type SearchItem = { title: string; detail: string; category: string; action: () => void };

function Symbol({ name, size = 18 }: { name: "search" | "close" | "arrow" | "bell" | "check" | "spark" | "plus" | "calendar" | "filter"; size?: number }) {
  const shapes = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 13h4"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    spark: <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    filter: <path d="M4 7h16M7 12h10m-7 5h4"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

export function CommandPalette({ role, navigation, doctors, patients, onClose, onNavigate, onBook, onAssistant }: { role: Role; navigation: string[]; doctors: Doctor[]; patients: Patient[]; onClose: () => void; onNavigate: (view: string) => void; onBook: (doctor: Doctor) => void; onAssistant: () => void }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const items = useMemo<SearchItem[]>(() => {
    const available: SearchItem[] = navigation.map(view => ({ title: view, detail: `Open ${view.toLowerCase()}`, category: "WORKSPACES", action: () => onNavigate(view) }));
    available.push({ title: "Ask MediFlow AI", detail: "Get care guidance and symptom support", category: "QUICK ACTIONS", action: onAssistant });
    if (role === "patient" || role === "admin") doctors.forEach(doctor => available.push({ title: doctor.name, detail: `${doctor.specialty} · ${doctor.next} · ${doctor.fee}`, category: "DOCTORS", action: () => role === "patient" ? onBook(doctor) : onNavigate("Doctors") }));
    if (role !== "patient") patients.forEach(patient => available.push({ title: patient.name, detail: `${patient.concern} · ${patient.time}`, category: "PATIENTS", action: () => onNavigate(role === "doctor" ? "My patients" : "Appointments") }));
    const term = query.trim().toLowerCase();
    return term ? available.filter(item => `${item.title} ${item.detail} ${item.category}`.toLowerCase().includes(term)) : available.slice(0, 8);
  }, [doctors, navigation, onAssistant, onBook, onNavigate, patients, query, role]);

  function choose(item: SearchItem) { item.action(); onClose(); }
  function handleKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { onClose(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setFocused(index => Math.min(index + 1, items.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setFocused(index => Math.max(index - 1, 0)); }
    if (event.key === "Enter" && items[focused]) { event.preventDefault(); choose(items[focused]); }
  }

  return <div className="command-backdrop" onClick={onClose}><section className="command-palette" onClick={event => event.stopPropagation()} aria-label="Search MediFlow"><div className="command-input"><Symbol name="search" size={20}/><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setFocused(0); }} onKeyDown={handleKey} placeholder="Search doctors, patients, pages, appointments..."/><button onClick={onClose}>ESC</button></div><div className="command-results">{items.length ? items.map((item, index) => <button key={`${item.category}-${item.title}`} className={`command-result ${focused === index ? "command-result-active" : ""}`} onMouseEnter={() => setFocused(index)} onClick={() => choose(item)}><span className="command-result-icon"><Symbol name={item.category === "DOCTORS" || item.category === "PATIENTS" ? "calendar" : item.category === "QUICK ACTIONS" ? "spark" : "arrow"} size={16}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><i>{item.category}</i></button>) : <div className="command-empty">No matches found for “{query}”. Try a doctor, specialty, patient, or page.</div>}</div><footer><span>↑ ↓ Navigate</span><span>↵ Open</span><span>esc Close</span></footer></section></div>;
}

export function NotificationsCenter({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: string) => void }) {
  const [jobs, setJobs] = useState<{ id: string; channel: string; status: string; attempts: number }[]>([]);
  const [read, setRead] = useState(false);
  useEffect(() => { let mounted = true; void fetch("/api/notifications").then(async response => { if (!response.ok || !mounted) return; const data = await response.json() as { jobs?: typeof jobs }; setJobs(data.jobs?.slice(0, 5) || []); }).catch(() => {}); return () => { mounted = false; }; }, []);
  const fallback = [{ id: "visit", channel: "AI visit brief ready", status: "delivered", attempts: 1 }, { id: "booking", channel: "Appointment confirmation", status: "delivered", attempts: 1 }, { id: "dose", channel: "Medication reminder due at 8:00 PM", status: "pending", attempts: 0 }];
  const updates = jobs.length ? jobs : fallback;
  return <div className="notification-backdrop" onClick={onClose}><aside className="notification-panel" onClick={event => event.stopPropagation()}><header><div><Symbol name="bell"/><strong>Notifications</strong><span>{read ? 0 : updates.length}</span></div><button onClick={onClose}><Symbol name="close" size={17}/></button></header><div className="notification-items">{updates.map(item => <button key={item.id} className="notification-item" onClick={() => { onNavigate("Appointments"); onClose(); }}><span className={`notification-state notification-state-${item.status}`}/><span><strong>{item.channel.replaceAll("_", " ")}</strong><small>{item.status === "delivered" ? "Successfully delivered" : item.status === "pending" ? "Scheduled and awaiting delivery" : `Delivery ${item.status} · attempt ${item.attempts}`}</small></span><Symbol name="arrow" size={14}/></button>)}</div><footer><button onClick={() => setRead(true)}><Symbol name="check" size={15}/> Mark all as read</button></footer></aside></div>;
}

export function FeatureWorkspace({ role, active, doctors, patients, query, onQuery, onBook, onAssistant, onAction }: { role: Role; active: string; doctors: Doctor[]; patients: Patient[]; query: string; onQuery: (query: string) => void; onBook: (doctor: Doctor) => void; onAssistant: () => void; onAction: (action: string) => void }) {
  const [specialty, setSpecialty] = useState("All specialties");
  const [liveDoctors, setLiveDoctors] = useState<Doctor[]>([]);
  useEffect(() => { if (!["Find a doctor", "Doctors"].includes(active)) return; let mounted = true; void fetch("/api/doctors").then(async response => { if (!response.ok || !mounted) return; const result = await response.json() as { doctors?: { name: string; specialty: string }[] }; setLiveDoctors((result.doctors || []).map(doctor => ({ name: doctor.name, specialty: doctor.specialty, initials: doctor.name.replace("Dr. ", "").split(" ").slice(0, 2).map(word => word[0]).join(""), color: "mint", rating: "New", next: "Slots available", fee: "₹850", experience: "Verified specialist", visits: "New" }))); }).catch(() => {}); return () => { mounted = false; }; }, [active]);
  const list = [...liveDoctors, ...doctors.filter(doctor => !liveDoctors.some(item => item.name === doctor.name))].filter(doctor => `${doctor.name} ${doctor.specialty}`.toLowerCase().includes(query.toLowerCase()) && (specialty === "All specialties" || doctor.specialty.toLowerCase().includes(specialty.toLowerCase())));
  const isDoctors = active === "Find a doctor" || active === "Doctors";
  const isPatients = active === "My patients" || active === "AI visit briefs";
  const title = active === "Find a doctor" ? "Find the right specialist" : active === "Doctors" ? "Your clinical care team" : active === "My patients" ? "Your patients" : active === "AI visit briefs" ? "AI-prepared visit briefs" : active;
  const details: Record<string, { text: string; items: { title: string; detail: string; state: string }[] }> = {
    "Prescriptions": { text: "Review your active medications and keep your care plan on track.", items: [{ title: "Amlodipine 5 mg", detail: "Once daily · after breakfast · Dr. Ananya Sharma", state: "Active" }, { title: "Vitamin D3 1000 IU", detail: "Once daily · after lunch · Dr. Arjun Mehta", state: "Active" }, { title: "Medication reminders", detail: "Morning 8:00 AM · Evening 8:00 PM", state: "Scheduled" }] },
    "Care timeline": { text: "Every important appointment, prescription, and follow-up in one view.", items: [{ title: "Upcoming cardiology follow-up", detail: "Dr. Ananya Sharma · Tuesday, Aug 25, 10:30 AM", state: "Upcoming" }, { title: "AI visit brief prepared", detail: "Symptoms reviewed and three clinician questions suggested", state: "Completed" }, { title: "Prescription renewed", detail: "Amlodipine 5 mg · August 21", state: "Completed" }] },
    "Availability": { text: "Manage consultation hours, session length, and upcoming leave.", items: [{ title: "Monday – Friday", detail: "9:00 AM – 5:00 PM · 30-minute appointments", state: "Available" }, { title: "Lunch break", detail: "1:00 PM – 2:00 PM · appointments blocked", state: "Protected" }, { title: "Upcoming leave", detail: "No approved leave scheduled this month", state: "Clear" }] },
    "Notifications": { text: "Track appointment confirmations, reminders, and provider delivery updates.", items: [{ title: "Booking confirmation", detail: "Patient and doctor updates are queued after confirmation", state: "Operational" }, { title: "Medication reminders", detail: "Frequency-based reminders are scheduled with each prescription", state: "Operational" }, { title: "Retry protection", detail: "Failed delivery retries automatically up to five times", state: "Enabled" }] },
    "Care intelligence": { text: "Identify urgency, missed follow-ups, and medication adherence gaps.", items: [{ title: "High-priority patient follow-up", detail: "2 patients need a clinician check-in this week", state: "Attention" }, { title: "Medication adherence", detail: "86% of monitored patients are on track", state: "On track" }, { title: "Care gaps prevented", detail: "18 timely interventions recorded this month", state: "Improving" }] },
  };
  const section = details[active];
  return <div className="page-content feature-page"><section className="welcome"><div><p className="eyebrow">{role === "patient" ? "YOUR CONNECTED CARE" : role === "doctor" ? "YOUR CLINICAL WORKSPACE" : "PRACTICE OPERATIONS"}</p><h1>{title}</h1><p>{isDoctors ? "Search by name or specialty and choose the right available clinician." : isPatients ? "Search your assigned patients and review their clinical preparation." : section?.text || "Manage this part of your connected care workspace."}</p></div><button className="button button-primary" onClick={() => isDoctors && role === "admin" ? onAction("Doctor profile creation opened") : isPatients ? onAssistant() : onAction(active === "Availability" ? "Availability editor opened" : active === "Prescriptions" ? "Medication reminder settings opened" : "Appointment booking opened")}><Symbol name={isPatients ? "spark" : "plus"} size={16}/>{isDoctors && role === "admin" ? "Add doctor" : isPatients ? "Ask care assistant" : active === "Availability" ? "Edit availability" : active === "Prescriptions" ? "Manage reminders" : "Take action"}</button></section>{isDoctors ? <><div className="feature-search-row"><label className="feature-search"><Symbol name="search"/><input autoFocus value={query} onChange={event => onQuery(event.target.value)} placeholder="Search doctors by name or specialty..."/></label><label className="feature-select"><Symbol name="filter" size={16}/><select value={specialty} onChange={event => setSpecialty(event.target.value)}>{["All specialties", "Cardio", "Dermato", "Neuro", "General"].map(option => <option key={option}>{option}</option>)}</select></label></div><div className="feature-results-count">{list.length} {list.length === 1 ? "specialist" : "specialists"} found</div><div className="feature-doctors">{list.length ? list.map(doctor => <article className="feature-doctor" key={doctor.name}><span className={`avatar avatar-${doctor.color}`}>{doctor.initials}</span><span><strong>{doctor.name}</strong><small>{doctor.specialty} · {doctor.experience}</small></span><span className="feature-availability">{doctor.next}</span><button onClick={() => role === "patient" ? onBook(doctor) : onAction(`Manage ${doctor.name}`)}>{role === "patient" ? "Book appointment" : "Manage doctor"}<Symbol name="arrow" size={15}/></button></article>) : <div className="feature-empty">No specialists match your search. Try another name or specialty.</div>}</div></> : isPatients ? <><label className="feature-search"><Symbol name="search"/><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search by patient, symptom, or urgency..."/></label><div className="feature-cards">{patients.filter(patient => `${patient.name} ${patient.concern} ${patient.urgency}`.toLowerCase().includes(query.toLowerCase())).map(patient => <article className="feature-card" key={patient.name}><div><strong>{patient.name}</strong><span>{patient.age} · {patient.time}</span></div><p>{patient.concern}</p><footer><span className={`feature-pill feature-pill-${patient.urgency}`}>{patient.urgency} priority</span><button onClick={() => onAction(`Consultation started for ${patient.name}`)}>Review visit <Symbol name="arrow" size={14}/></button></footer></article>)}</div></> : <div className="feature-list">{section?.items.map(item => <article className="feature-list-item" key={item.title}><span className="feature-list-icon"><Symbol name={active === "Care intelligence" ? "spark" : active === "Notifications" ? "bell" : "calendar"} size={18}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className={`feature-pill ${item.state === "Attention" ? "feature-pill-high" : "feature-pill-low"}`}>{item.state}</span><button onClick={() => onAction(`${item.title} details opened`)}><Symbol name="arrow" size={16}/></button></article>)}</div>}</div>;
}

export function ActionDialog({ action, role, onClose, onSave }: { action: string; role: Role; onClose: () => void; onSave: (message: string) => void }) {
  const isProfile = /profile|contact/i.test(action);
  const isPayment = /payment|bank|settlement/i.test(action);
  const isVitals = /vital|reading|blood.pressure/i.test(action);
  const isAvailability = /availability|reminder|medication/i.test(action);
  const [first, setFirst] = useState(isProfile ? role === "patient" ? "Rhea Kapoor" : role === "doctor" ? "Dr. Ananya Sharma" : "Kavya Menon" : isPayment ? "rhea.kapoor@okicici" : isVitals ? "118" : "9:00 AM");
  const [second, setSecond] = useState(isProfile ? role === "patient" ? "rhea.kapoor@example.com" : role === "doctor" ? "ananya.sharma@mediflow.health" : "kavya.menon@mediflow.health" : isPayment ? "Primary account" : isVitals ? "76" : "5:00 PM");
  const title = isProfile ? "Update account details" : isPayment ? "Manage payment details" : isVitals ? "Add a health reading" : isAvailability ? "Update your preferences" : "Review details";
  function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!first.trim()) return; onSave(isProfile ? "Profile details updated for this demo session" : isPayment ? "Payment preference updated successfully" : isVitals ? `Blood pressure recorded: ${first}/${second} mmHg` : "Your preferences were updated successfully"); onClose(); }
  return <div className="modal-backdrop" onClick={onClose}><form className="booking-modal action-dialog" onClick={event => event.stopPropagation()} onSubmit={save}><button type="button" className="modal-close" onClick={onClose}><Symbol name="close"/></button><p className="eyebrow">{role.toUpperCase()} WORKSPACE · QUICK ACTION</p><h2>{title}</h2><p className="action-dialog-copy">{action.replace(/ opened.*/, "")}. Make changes below and save when you’re ready.</p><label className="clinical-label">{isProfile ? "Full name" : isPayment ? "UPI ID or account reference" : isVitals ? "Systolic pressure" : "Start time"}</label><input className="clinical-input" value={first} onChange={event => setFirst(event.target.value)} required/><label className="clinical-label">{isProfile ? "Email address" : isPayment ? "Account label" : isVitals ? "Diastolic pressure" : "End time"}</label><input className="clinical-input" value={second} onChange={event => setSecond(event.target.value)}/><button className="button button-primary full-width" type="submit"><Symbol name="check" size={16}/>Save changes</button></form></div>;
}
