# Generates tests/fixtures/cad/toy_aircraft.step (13 Oct 2026). Needs cadquery (pip install cadquery).
#   python3 make_toy_aircraft.py toy_aircraft.step
# A toy aircraft: fuselage, two engines (one part, two placements), two redundant flight
# control computers (one part, two placements) and a wiring harness, in mm, AP214.
# Product ids are then set to part numbers and names to readable names, as a CAD tool would.
import cadquery as cq, sys
out = sys.argv[1] + ".raw.step"
fus = cq.Workplane("YZ").circle(1000).extrude(10000)          # along +X, 0..10000
eng = cq.Workplane("YZ").circle(350).extrude(2500)            # nacelle
box = cq.Workplane("XY").box(400, 300, 200)                    # avionics box
harness = cq.Workplane("XY").polyline([(2000,0),(4500,0),(4500,1200)]).offset2D(20).extrude(40)

prop = cq.Assembly(name="PROPULSION")
prop.add(eng, name="ENGINE_L", loc=cq.Location((3000, -2500, -400)), color=cq.Color(0.6,0.6,0.65))
prop.add(eng, name="ENGINE_R", loc=cq.Location((3000,  2500, -400)), color=cq.Color(0.6,0.6,0.65))
avi = cq.Assembly(name="AVIONICS")
avi.add(box, name="FCC_A", loc=cq.Location((2000, -300, -500)), color=cq.Color(0.2,0.4,0.8))
avi.add(box, name="FCC_B", loc=cq.Location((2000,  300, -500)), color=cq.Color(0.2,0.4,0.8))
ac = cq.Assembly(name="TOY_AIRCRAFT")
ac.add(fus, name="FUSELAGE", color=cq.Color(0.85,0.85,0.88))
ac.add(prop)
ac.add(avi)
ac.add(harness, name="HARNESS_W1", loc=cq.Location((0,0,-600)), color=cq.Color(0.9,0.5,0.1))
ac.export(out)

import re
s=open(out).read()
M = {'TOY_AIRCRAFT':('SLA-TOY-001','Toy Aircraft'),'FUSELAGE':('SLA-FUS-010','Fuselage'),'PROPULSION':('SLA-PRP-100','Propulsion'),
   'ENGINE_L':('SLA-ENG-110','Engine Nacelle'),'AVIONICS':('SLA-AVI-200','Avionics'),'FCC_A':('SLA-FCC-210','Flight Control Computer'),
   'HARNESS_W1':('SLA-W1-300','Harness W1')}
for k,(pid,name) in M.items():
    s=s.replace("PRODUCT('%s','%s'"%(k,k),"PRODUCT('%s','%s'"%(pid,name))
s=re.sub(r"FILE_NAME\('[^']*'","FILE_NAME('toy_aircraft.step'",s)
s=re.sub(r"(FILE_NAME\('toy_aircraft.step',)'[^']*'",r"\1'2026-10-13T00:00:00'",s)
open(sys.argv[1],'w').write(s)
import os; os.remove(out)
