import React, { useEffect, useState } from "react";
import { useLoaderData } from "react-router-dom";

function Github() {
    const data = useLoaderData()
  //     const [data, setdata] = useState([])
  // useEffect(() => {
  //     fetch(`https://api.github.com/users/talibbb13`)
  //         .then((res) => res.json())
  //         .then((res)=> setdata(res))
  //     console.log(data);
  // }, [])

  return (
    <>
      <div className="py-5 text-xl font-semibold px-10 flex flex-col gap-3">
        <h1>
          Name: &nbsp;
          <span className="font-mono text-red-700">{data.name}</span>
        </h1>

        <h1>
          username: &nbsp;
          <span className="font-mono text-red-700">{data.login}</span>
        </h1>

        <h1 className="flex gap-5">
          Github Avatar:
          <img className="h-40 rounded-full " src={data.avatar_url} />
        </h1>

        <h1>
          Bio: &nbsp;<span className="font-mono text-red-700">{data.bio}</span>
        </h1>

        <h1>
          Total Repositories: &nbsp;
          <span className="font-mono text-red-700">{data.public_repos}</span>
        </h1>

        <h1>
          Twitter username: &nbsp;
          <span className="font-mono text-red-700">
            {data.twitter_username}
          </span>
        </h1>
      </div>
    </>
  );
}

export default Github;
export const githubInfoLoader = async () => {
    const res = await fetch(`https://api.github.com/users/talibbb13`)
    return res.json()

}
