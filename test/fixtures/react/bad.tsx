import { useEffect, useState } from "react";

export function Card({ show, id }: { show: boolean; id: number }) {
  if (show) {
    useState(0);
  }
  useEffect(() => {
    console.log(id);
  }, []);
  return <img src="a.png" />;
}
