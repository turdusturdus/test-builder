import React from 'react'
import { useParams } from 'react-router-dom'

function User() {
    const { userid } = useParams()
  return (
    <>
      <h1 className="text-center py-5 text-3xl font-bold bg-yellow-500">
        User id is <span className='font-mono text-red-700'>`{userid}`</span>
      </h1>
    </>
  );
}

export default User
