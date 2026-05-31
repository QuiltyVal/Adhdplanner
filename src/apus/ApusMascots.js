import React from "react";
import angelQuiet from "../assets/apus/angel_quiet_2048.png";
import devilQuiet from "../assets/apus/devil_quiet_2048.png";

function ApusMascots() {
  return (
    <div className="apus-mascots" aria-hidden="true">
      <img className="apus-mascot apus-mascot--angel" src={angelQuiet} alt="" />
      <img className="apus-mascot apus-mascot--devil" src={devilQuiet} alt="" />
    </div>
  );
}

export default ApusMascots;
