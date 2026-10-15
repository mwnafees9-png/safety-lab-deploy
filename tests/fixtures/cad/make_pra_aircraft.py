# Generates tests/fixtures/cad/pra_aircraft.step (14 Oct 2026, p3-pra). Needs cadquery.
#   python3 make_pra_aircraft.py pra_aircraft.step
# A fixture for particular risks: fuselage with a nose radome and windshield, two wing engines
# each with an HPT rotor disc in the plane of two redundant flight computers, wings with tips,
# a fin, and a main gear tire under a hydraulic line. mm, AP214, x aft, y right, z up.
import cadquery as cq, sys, re, os
out = sys.argv[1] + ".raw.step"
def B(x0,x1,y0,y1,z0,z1): return cq.Workplane("XY").box(x1-x0,y1-y0,z1-z0).translate(((x0+x1)/2,(y0+y1)/2,(z0+z1)/2))
disc = cq.Workplane("YZ").circle(500).extrude(100)
disc2 = cq.Workplane("YZ").circle(500).extrude(100).translate((0, 0, 0.001))   # a distinct shape so it keeps its own name
tire = cq.Workplane("XZ").circle(600).circle(250).extrude(400)
ac = cq.Assembly(name="PRA_AIRCRAFT")
ac.add(B(1500,18000,-1000,-900,-1000,1000).union(B(1500,18000,900,1000,-1000,1000)), name="FUSELAGE", color=cq.Color(0.85,0.85,0.88))
# closed fuselage (14 Oct 2026): top and bottom skins so the computers are inside
ac.add(B(1500,18000,-900,900,900,1000), name="FUSELAGE_TOP", color=cq.Color(0.85,0.85,0.88))
ac.add(B(1500,18000,-900,900,-1000,-900), name="FUSELAGE_BOTTOM", color=cq.Color(0.85,0.85,0.88))
ac.add(B(0,1500,-1000,1000,-1000,1000), name="NOSE_RADOME", color=cq.Color(0.7,0.7,0.6))
ac.add(B(1500,1700,-600,600,1000,1500), name="WINDSHIELD", color=cq.Color(0.4,0.6,0.9))
ac.add(B(9000,11000,-8000,-1000,-60,60), name="WING_L", color=cq.Color(0.8,0.8,0.82))
ac.add(B(9000,11000,1000,8000,-60,60), name="WING_R", color=cq.Color(0.8,0.8,0.82))
ac.add(B(10200,11000,-8300,-8000,-60,60), name="WING_TIP_L", color=cq.Color(0.9,0.3,0.3))
ac.add(B(17000,18500,-100,100,1000,5000), name="FIN", color=cq.Color(0.8,0.8,0.82))
ac.add(disc, name="ENG1_HPT_ROTOR_DISC", loc=cq.Location((9800,-4000,0)), color=cq.Color(0.5,0.5,0.5))
ac.add(disc2, name="ENG2_HPT_ROTOR_DISC", loc=cq.Location((9800,4000,0)), color=cq.Color(0.5,0.5,0.5))
ac.add(B(9700,10000,-600,-300,-100,100), name="FCC_1", color=cq.Color(0.2,0.4,0.8))
ac.add(B(9700,10000,300,600,-100,100), name="FCC_2", color=cq.Color(0.2,0.4,0.8))
ac.add(tire, name="MAIN_GEAR_TIRE_L", loc=cq.Location((11600,-1800,-1800)), color=cq.Color(0.1,0.1,0.1))
ac.add(B(11300,11900,-2100,-1900,-1100,-1000), name="HYD_LINE_L", color=cq.Color(0.9,0.6,0.1))
ac.export(out)
s=open(out).read()
s=re.sub(r"FILE_NAME\('[^']*'","FILE_NAME('pra_aircraft.step'",s)
s=re.sub(r"(FILE_NAME\('pra_aircraft.step',)'[^']*'",r"\1'2026-10-14T00:00:00'",s)
open(sys.argv[1],'w').write(s); os.remove(out)
