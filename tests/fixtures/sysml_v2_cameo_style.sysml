/* A SysML v2 model written the way Cameo / CATIA Magic 2026x and the SysML v2 pilot tools write it:
   units from ISQ, port and interface definitions, multiplicities, subjects and required constraints,
   successions, aliases, comments, enumerations and a state machine. Fixture for Safety Lab's SysML v2
   import (tests/regression_sysml_v2_20261013b.test.js). Fictional aircraft. */
package 'Wheel Brake Model' {
    private import ScalarValues::*;
    private import ISQ::*;
    private import SI::*;

    package Interfaces {
        port def HydraulicPort {
            out attribute pressure : PressureValue;
        }
        port def CommandPort {
            in attribute brakeCommand : Real;
        }
        interface def HydraulicLine {
            end supply : HydraulicPort;
            end demand : ~HydraulicPort;
        }
        enum def BrakeMode {
            enum normal;
            enum alternate;
            enum emergency;
        }
    }

    package Structure {
        private import Interfaces::*;
        part def <'WBS'> 'Wheel Brake System' {
            doc /* Decelerates the aircraft on the ground. */
            attribute mode : BrakeMode;
            part bscu : 'Brake System Control Unit' [2];
            part 'green pump' : 'Hydraulic Pump';
            part 'blue pump' : 'Hydraulic Pump';
            interface line1 : HydraulicLine connect supply ::> 'green pump'.supplyPort to demand ::> bscu.'hyd in';
        }
        part def 'Brake System Control Unit' {
            attribute mass :> ISQ::mass = 4.2 [kg];
            port 'hyd in' : ~HydraulicPort;
            port cmd : CommandPort;
        }
        part def 'Hydraulic Pump' {
            port supplyPort : HydraulicPort;
        }
        part def <'EPS'> 'Electrical Power System' {
            part 'main bus' : 'DC Bus';
        }
        part def 'DC Bus';
        part def Aircraft {
            part wbs : 'Wheel Brake System';
            part eps : 'Electrical Power System';
            connection power : 'Power Link' connect eps.'main bus' to wbs.bscu;
        }
        connection def 'Power Link' {
            end source : 'DC Bus';
            end sink : 'Brake System Control Unit';
        }
        part aircraft : Aircraft;
        alias WBSAlias for 'Wheel Brake System';
    }

    package Behavior {
        action def <'F-DEC'> 'Decelerate the aircraft' {
            action <'F-DEC-1'> 'Apply wheel braking';
            action <'F-DEC-2'> 'Prevent wheel skid';
            first 'Apply wheel braking' then 'Prevent wheel skid';
        }
        action def <'F-STEER'> 'Steer on the ground';
        action deceleration : 'Decelerate the aircraft';
        state def BrakeStates {
            entry; then off;
            state off;
            state on;
            transition first off then on;
        }
    }

    package Requirements {
        requirement def <'REQ-WBS-1'> 'Stopping distance' {
            doc /* The wheel brake system shall stop the aircraft within 1200 m from 140 kt. */
            subject wbs : Structure::'Wheel Brake System';
            attribute maxDistance : LengthValue;
            require constraint { maxDistance <= 1200 [m] }
        }
        requirement <'REQ-WBS-2'> 'Loss of braking' {
            doc /* Loss of all wheel braking shall be extremely improbable. */
        }
        comment about Structure::'Wheel Brake System' /* Reviewed at PDR. */
    }

    allocation def Realization;
    allocate Behavior::deceleration to Structure::aircraft.wbs;
}
